import {useThree} from "@react-three/fiber";
import {useEffect} from "react";
import {
  Float32BufferAttribute,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import type {NodeMaterial} from "three/webgpu";

import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../camera/postprocess/settings";
import {getSkipGTAO, setSkipGTAO} from "../camera/postprocess/skipGTAO";
import {subscribeColliders} from "../core/bvh";
import {holdShaderWarmup} from "../core/ShaderWarmup";
import {erasableBakedAO} from "./aoErase";
import {type AOMode, aoModeOf, skipsGTAO} from "./aoMode";
import {loadBakedAO} from "./atlasCache";
import {atlasUV, type BakedAOLayout, findLayoutMismatch} from "./format";
import {assignCharts, listBakeMeshes, meshSignature} from "./meshes";
import {bakedAOFiles} from "./paths";
import {subscribeBakeTargets} from "./targets";

type AOMaterial = Material & {
  aoMap: Texture | null;
  aoMapIntensity: number;
};

const hasAOMap = (m: Material): m is AOMaterial => "aoMap" in m;

const isNodeMaterial = (m: Material): m is AOMaterial & NodeMaterial =>
  (m as {isNodeMaterial?: boolean}).isNodeMaterial === true;

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

export const applyBakedAtlas = (
  meshes: readonly Mesh[],
  root: Object3D,
  layout: BakedAOLayout,
  texture: Texture,
):
  | {undo: () => void; materials: AOMaterial[]; warnings: string[]}
  | {mismatch: string} => {
  const mismatch = findLayoutMismatch(layout, meshes.map(meshSignature));
  if (mismatch) {
    return {mismatch};
  }

  // aoMap は uv1 で引くので、uv1 を持たないベイク対象外の mesh と共有している material には貼らない
  // (WebGPU では uv1 の無い mesh のパイプラインが作れなくなる)
  const bakeSet = new Set<Object3D>(meshes);
  const sharedWithOthers = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || bakeSet.has(mesh)) {
      return;
    }
    for (const m of materialsOf(mesh)) {
      sharedWithOthers.add(m);
    }
  });
  const modesByMaterial = new Map<Material, AOMode[]>();
  for (const mesh of meshes) {
    for (const m of materialsOf(mesh)) {
      const modes = modesByMaterial.get(m) ?? [];
      modes.push(aoModeOf(mesh));
      modesByMaterial.set(m, modes);
    }
  }

  const warnings: string[] = [];
  const undos: (() => void)[] = [];
  const materials: AOMaterial[] = [];
  let chartOffset = 0;
  meshes.forEach((mesh, i) => {
    const geometry = mesh.geometry;
    const {chart} = assignCharts(geometry);
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
    chartOffset += (layout.meshes[i] as {chartCount: number}).chartCount;
    undos.push(() => {
      if (prevUV1) {
        geometry.setAttribute("uv1", prevUV1);
      } else {
        geometry.deleteAttribute("uv1");
      }
    });

    for (const material of materialsOf(mesh)) {
      if (!hasAOMap(material)) {
        continue;
      }
      if (sharedWithOthers.has(material)) {
        warnings.push(
          `material "${material.name}" はベイク対象外の mesh と共有されているので aoMap を貼りません`,
        );
        continue;
      }
      if (material.aoMap === texture) {
        continue;
      }
      const prev = material.aoMap;
      const prevIntensity = material.aoMapIntensity;
      const prevSkip = getSkipGTAO(material);
      const nodeMaterial = isNodeMaterial(material) ? material : null;
      const prevAONode = nodeMaterial?.aoNode ?? null;
      if (nodeMaterial) {
        nodeMaterial.aoNode = erasableBakedAO();
      }
      material.aoMap = texture;
      setSkipGTAO(material, skipsGTAO(modesByMaterial.get(material) ?? []));
      material.needsUpdate = true;
      materials.push(material);
      undos.push(() => {
        material.aoMap = prev;
        material.aoMapIntensity = prevIntensity;
        if (nodeMaterial) {
          nodeMaterial.aoNode = prevAONode;
        }
        setSkipGTAO(material, prevSkip);
        material.needsUpdate = true;
      });
    }
  });
  return {
    undo: () => {
      for (const u of undos.reverse()) {
        u();
      }
    },
    materials,
    warnings,
  };
};

/** パネルのベイク AO の強さを aoMapIntensity に反映する(uniform なので再コンパイルは起きない) */
export const syncIntensity = (materials: readonly AOMaterial[]) => {
  const {intensity} = getPostProcessSettings().bakedAO;
  for (const m of materials) {
    m.aoMapIntensity = intensity;
  }
};

/**
 * 事前ベイクした AO(`pnpm bake:ao --scene=<name>` の出力)を、シーンの静的 mesh に aoMap として貼る。
 * aoMap は間接光だけを減衰させる。GTAO(ポストプロセス)との分担は mesh の AO モード(aoMode.ts)に従い、
 * baked のマテリアルには skipGTAO を立てて GTAO を掛けない。
 * パネルでベイク AO を無効にすると貼ったものを外す(baked の面も GTAO に戻る)。
 * ベイク結果が無い・シーンと合わない場合は警告だけ出して何もしない(GTAO だけで描画される)。
 * コライダー・ベイク対象(BakeTarget)の登録が変わるたびに(非同期に読み込む prop の追加、Fast Refresh での再マウントなど)
 * 貼り直すので、シーンが揃った時点でベイク結果と一致すれば AO が付く
 */
export function BakedAO({scene}: {scene: string}) {
  const root = useThree((s) => s.scene);

  useEffect(() => {
    let disposed = false;
    // 最初の貼り付け(または貼らないと決まる)までシェーダーのウォームアップを待たせる。aoMap を貼るとマテリアルが再コンパイルされるため
    const releaseWarmup = holdShaderWarmup();
    let undo: (() => void) | null = null;
    let applied: AOMaterial[] = [];
    let unsubscribe: (() => void) | null = null;
    let apply: (() => void) | null = null;
    let lastMessage = "";

    let scheduled = false;
    const schedule = () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!disposed) {
          apply?.();
        }
      });
    };

    let enabled = getPostProcessSettings().bakedAO.enabled;
    const unsubscribeSettings = subscribePostProcessSettings(() => {
      const next = getPostProcessSettings().bakedAO.enabled;
      if (next !== enabled) {
        enabled = next;
        schedule();
      } else {
        syncIntensity(applied);
      }
    });

    const log = (level: "info" | "warn", message: string) => {
      if (message === lastMessage) {
        return;
      }
      lastMessage = message;
      console[level](`[bakedAO] ${message}`);
    };

    (async () => {
      const data = await loadBakedAO(scene);
      if (disposed) {
        return;
      }
      if (!data) {
        log(
          "info",
          `${bakedAOFiles(scene).layout} がありません。pnpm bake:ao --scene=${scene} でベイクできます`,
        );
        return;
      }
      const {layout, atlas} = data;

      apply = () => {
        undo?.();
        undo = null;
        applied = [];
        if (!enabled) {
          log("info", `${scene}: ベイク AO を外しました`);
          return;
        }
        const result = applyBakedAtlas(listBakeMeshes(), root, layout, atlas);
        if ("mismatch" in result) {
          log(
            "warn",
            `ベイク結果がシーンと合わないので使いません: ${result.mismatch}。pnpm bake:ao --scene=${scene} で再ベイクしてください`,
          );
          return;
        }
        undo = result.undo;
        applied = result.materials;
        syncIntensity(applied);
        const warning = [...new Set(result.warnings)].join(" / ");
        if (warning) {
          log("warn", warning);
          return;
        }
        log(
          "info",
          `${scene}: ${layout.meshes.length} mesh / ${layout.rects.length} チャート / アトラス ${layout.atlasW}x${layout.atlasH}`,
        );
      };
      const offColliders = subscribeColliders(schedule);
      const offTargets = subscribeBakeTargets(schedule);
      unsubscribe = () => {
        offColliders();
        offTargets();
      };
      apply();
    })()
      .catch((e: unknown) => {
        console.warn("[bakedAO] 読み込みに失敗しました", e);
      })
      .finally(releaseWarmup);

    return () => {
      disposed = true;
      releaseWarmup();
      unsubscribe?.();
      unsubscribeSettings();
      undo?.();
    };
  }, [scene, root]);

  return null;
}
