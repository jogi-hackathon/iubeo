import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import {
  Float32BufferAttribute,
  LinearFilter,
  type Material,
  type Mesh,
  NoColorSpace,
  type Object3D,
  type Texture,
  TextureLoader,
} from "three";
import { subscribeColliders } from "../core/bvh";
import {
  atlasUV,
  type BakedAOLayout,
  findLayoutMismatch,
  parseLayout,
} from "./format";
import { assignCharts, listBakeMeshes, meshSignature } from "./meshes";
import { bakedAOFiles } from "./paths";

type AOMaterial = Material & { aoMap: Texture | null };

const hasAOMap = (m: Material): m is AOMaterial => "aoMap" in m;

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

const loadAtlas = async (url: string): Promise<Texture> => {
  const texture = await new TextureLoader().loadAsync(url);
  // AO はリニアの値。アトラスはチャートを詰めてあるので mipmap は隣のチャートがにじむため使わない
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  // aoMap は uv1(アトラス上の uv)で引く
  texture.channel = 1;
  return texture;
};

/** 現在のシーンの静的 mesh にアトラスを貼る。貼れたら元に戻す関数を、合わなければ理由を返す */
const applyAtlas = (
  root: Object3D,
  layout: BakedAOLayout,
  texture: Texture,
): { undo: () => void } | { mismatch: string } => {
  const meshes = listBakeMeshes();
  const mismatch = findLayoutMismatch(layout, meshes.map(meshSignature));
  if (mismatch) return { mismatch };

  // aoMap は uv1 で引くので、uv1 を持たないベイク対象外の mesh と共有している material には貼らない
  // (WebGPU では uv1 の無い mesh のパイプラインが作れなくなる)
  const bakeSet = new Set<Object3D>(meshes);
  const sharedWithOthers = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || bakeSet.has(mesh)) return;
    for (const m of materialsOf(mesh)) sharedWithOthers.add(m);
  });

  const undos: (() => void)[] = [];
  let chartOffset = 0;
  meshes.forEach((mesh, i) => {
    const geometry = mesh.geometry;
    const { chart } = assignCharts(geometry);
    const uvAttr = geometry.getAttribute("uv");
    const uv = new Float32Array(uvAttr.count * 2);
    for (let k = 0; k < uvAttr.count; k++) {
      uv[k * 2] = uvAttr.getX(k);
      uv[k * 2 + 1] = uvAttr.getY(k);
    }
    const prevUV1 = geometry.getAttribute("uv1");
    geometry.setAttribute(
      "uv1",
      new Float32BufferAttribute(atlasUV(uv, chart, chartOffset, layout), 2),
    );
    chartOffset += (layout.meshes[i] as { chartCount: number }).chartCount;
    undos.push(() => {
      if (prevUV1) geometry.setAttribute("uv1", prevUV1);
      else geometry.deleteAttribute("uv1");
    });

    for (const material of materialsOf(mesh)) {
      if (!hasAOMap(material)) continue;
      if (sharedWithOthers.has(material)) {
        console.warn(
          `[bakedAO] material "${material.name}" はベイク対象外の mesh と共有されているので aoMap を貼りません`,
        );
        continue;
      }
      const prev = material.aoMap;
      material.aoMap = texture;
      material.needsUpdate = true;
      undos.push(() => {
        material.aoMap = prev;
        material.needsUpdate = true;
      });
    }
  });
  return {
    undo: () => {
      for (const u of undos.reverse()) u();
    },
  };
};

/**
 * 事前ベイクした AO(`pnpm bake:ao --scene=<name>` の出力)を、シーンの静的 mesh に aoMap として貼る。
 * aoMap は間接光だけを減衰させ、GTAO(ポストプロセス)の AO とは掛け算で重なる。
 * ベイク結果が無い・シーンと合わない場合は警告だけ出して何もしない(GTAO だけで描画される)。
 * コライダーの登録が変わるたびに(非同期に読み込む prop の追加、Fast Refresh での再マウントなど)
 * 貼り直すので、シーンが揃った時点でベイク結果と一致すれば AO が付く
 */
export function BakedAO({ scene }: { scene: string }) {
  const root = useThree((s) => s.scene);

  useEffect(() => {
    let disposed = false;
    let texture: Texture | null = null;
    let undo: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let lastMessage = "";

    const log = (level: "info" | "warn", message: string) => {
      // 貼り直しのたびに同じ内容を出さない
      if (message === lastMessage) return;
      lastMessage = message;
      console[level](`[bakedAO] ${message}`);
    };

    (async () => {
      const files = bakedAOFiles(scene);
      const urls = {
        atlas: `${import.meta.env.BASE_URL}${files.atlas}`,
        layout: `${import.meta.env.BASE_URL}${files.layout}`,
      };
      const res = await fetch(urls.layout);
      // SPA フォールバックのあるホスティングでは、無いファイルが index.html(200)で返る
      if (!res.ok || res.headers.get("content-type")?.startsWith("text/html")) {
        log(
          "info",
          `${urls.layout} がありません。pnpm bake:ao --scene=${scene} でベイクできます`,
        );
        return;
      }
      const layout = parseLayout(await res.arrayBuffer());
      const atlas = await loadAtlas(urls.atlas);
      if (disposed) {
        atlas.dispose();
        return;
      }
      texture = atlas;

      const apply = () => {
        undo?.();
        undo = null;
        const result = applyAtlas(root, layout, atlas);
        if ("mismatch" in result) {
          log(
            "warn",
            `ベイク結果がシーンと合わないので使いません: ${result.mismatch}。pnpm bake:ao --scene=${scene} で再ベイクしてください`,
          );
          return;
        }
        undo = result.undo;
        log(
          "info",
          `${scene}: ${layout.meshes.length} mesh / ${layout.rects.length} チャート / アトラス ${layout.atlasW}x${layout.atlasH}`,
        );
      };
      // 1回のコミットで複数のコライダーが登録されるので、マイクロタスクでまとめて1回だけ貼り直す
      let scheduled = false;
      unsubscribe = subscribeColliders(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (!disposed) apply();
        });
      });
      apply();
    })().catch((e: unknown) => {
      console.warn("[bakedAO] 読み込みに失敗しました", e);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      undo?.();
      texture?.dispose();
    };
  }, [scene, root]);

  return null;
}
