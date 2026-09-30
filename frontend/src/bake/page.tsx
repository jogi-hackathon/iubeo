import {Canvas, useThree} from "@react-three/fiber";
import {type CSSProperties, Suspense, useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {WebGPURenderer} from "three/webgpu";

import {type SceneName, scenes} from "../scenes";
import {BAKE_SAVE_PATH, type BakeSaveMeta, bakedAOFiles} from "./paths";
import {type BakeProgress, bakeSceneAO} from "./run";

// dev 専用の AO ベイクページ(bake.html)。シーンを描画せずにマウントだけして、BVHCollider に登録された
// 静的 mesh の AO を WebGPU でベイクし、dev サーバー(scripts/bakeSavePlugin.ts)へ送って public/ao/ に保存する。
// URL パラメータ: ?scene=<名前>(既定 test)&allowSoftware=1(ソフトウェア実装の adapter でも続行)
// 終了時に window.__bakeResult を置く(scripts/bake-ao.ts が待つ)

interface BakeResult {
  ok: boolean;
  error?: string;
  files?: string[];
  timings?: Record<string, number>;
  adapter?: Record<string, unknown>;
  chartCount?: number;
  hiddenCount?: number;
  atlasW?: number;
  atlasH?: number;
}

declare global {
  interface Window {
    __bakeResult?: BakeResult;
  }
}

const params = new URLSearchParams(location.search);
const sceneName = params.get("scene") ?? "test";
const allowSoftware = params.get("allowSoftware") === "1";
const SOFTWARE_RE =
  /swiftshader|llvmpipe|lavapipe|softpipe|software|microsoft basic render|warp/i;

const isSceneName = (name: string): name is SceneName => name in scenes;

/** WebGPU が使えないと WebGPURenderer は黙って WebGL2 に落ちるので、確認して止める */
const createRenderer = async (props: object) => {
  const renderer = new WebGPURenderer({
    ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
    antialias: false,
  });
  await renderer.init();
  return renderer;
};

interface AdapterLike {
  info?: Record<string, unknown>;
  isFallbackAdapter?: boolean;
}

/**
 * WebGPUBackend は adapter を保持しないので、同じ条件(three の WebGPUBackend.init と core/capabilities.ts と同じ)で
 * もう一度 adapter を取って中身を見る
 */
const adapterInfo = async (): Promise<Record<string, unknown>> => {
  const gpu = (
    navigator as {
      gpu?: {requestAdapter(o?: object): Promise<AdapterLike | null>};
    }
  ).gpu;
  const adapter = await gpu?.requestAdapter({
    featureLevel: "compatibility",
    powerPreference: "high-performance",
  });
  const info = adapter?.info ?? {};
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    isFallbackAdapter: Boolean(
      info.isFallbackAdapter ?? adapter?.isFallbackAdapter,
    ),
  };
};

const save = async (
  scene: string,
  atlas: Uint8Array,
  atlasW: number,
  atlasH: number,
  layoutBytes: Uint8Array,
) => {
  const meta: BakeSaveMeta = {
    scene,
    atlasW,
    atlasH,
    layoutLength: layoutBytes.length,
  };
  const body = new Uint8Array(atlas.length + layoutBytes.length);
  body.set(atlas, 0);
  body.set(layoutBytes, atlas.length);
  const res = await fetch(BAKE_SAVE_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Bake-Meta": encodeURIComponent(JSON.stringify(meta)),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`保存に失敗しました: ${res.status} ${await res.text()}`);
  }
};

function Runner({onProgress}: {onProgress: (p: BakeProgress) => void}) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;

  useEffect(() => {
    let adapter: Record<string, unknown> | undefined;
    (async () => {
      const backend = gl.backend as unknown as {isWebGPUBackend?: boolean};
      if (!backend.isWebGPUBackend) {
        throw new Error(
          "WebGPU バックエンドで初期化できませんでした(WebGL フォールバックではベイクしません)",
        );
      }
      adapter = await adapterInfo();
      console.info(`[bake] adapter: ${JSON.stringify(adapter)}`);
      const text = Object.values(adapter).join(" ");
      if (adapter.isFallbackAdapter || SOFTWARE_RE.test(text)) {
        if (!allowSoftware) {
          throw new Error(
            "WebGPU adapter がソフトウェア実装です。実 GPU で開くか --allow-software を付けてください",
          );
        }
        console.info("[bake] 警告: ソフトウェア実装の adapter で続行します");
      }

      const tAll = performance.now();
      const out = await bakeSceneAO(gl, onProgress);
      onProgress({status: "保存中"});
      await save(
        sceneName,
        out.atlas,
        out.layout.atlasW,
        out.layout.atlasH,
        out.layoutBytes,
      );
      out.timings.total = performance.now() - tAll;
      const files = Object.values(bakedAOFiles(sceneName)).map(
        (f) => `public/${f}`,
      );
      onProgress({status: `完了: ${files.join(", ")}`});
      window.__bakeResult = {
        ok: true,
        files,
        timings: out.timings,
        adapter,
        chartCount: out.layout.rects.length,
        hiddenCount: out.hiddenCount,
        atlasW: out.layout.atlasW,
        atlasH: out.layout.atlasH,
      };
    })().catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[bake] ${error}`);
      onProgress({status: `エラー: ${error}`});
      window.__bakeResult = {ok: false, error, adapter};
    });
    // マウント時に1回だけ走らせる(StrictMode は使っていない)
  }, [gl, onProgress]);

  return null;
}

const statusStyle: CSSProperties = {
  font: "13px/1.5 ui-monospace, Menlo, monospace",
  margin: 16,
};

function BakePage() {
  const [progress, setProgress] = useState<BakeProgress>({status: "起動中"});

  if (!isSceneName(sceneName)) {
    const error = `不明なシーンです: ${sceneName}(${Object.keys(scenes).join(" / ")})`;
    window.__bakeResult = {ok: false, error};
    return <div style={statusStyle}>{error}</div>;
  }
  const Scene = scenes[sceneName];
  const {done, total} = progress;
  return (
    <>
      <div style={statusStyle}>
        <div>AO bake: {sceneName}</div>
        <div>
          {progress.status}
          {total
            ? ` ${done}/${total} (${(((done ?? 0) / total) * 100).toFixed(1)}%)`
            : ""}
        </div>
      </div>
      {/* 描画はしない(frameloop="never")。シーンをマウントしてコライダーを登録させるためだけに使う */}
      <Canvas
        gl={createRenderer}
        frameloop="never"
        style={{width: 1, height: 1}}
      >
        {/* Runner をシーンと同じ Suspense 境界に入れる。Suspense で読み込む prop(useGLTF / useLoader など)が
            すべて解決するまで境界ごとコミットされないので、Runner の effect が走る時点でシーンは揃っている。
            useEffect で自前に非同期ロードする prop はここで待てないので、静的な prop の読み込みは Suspense で行うこと */}
        <Suspense fallback={null}>
          <Scene />
          <Runner onProgress={setProgress} />
        </Suspense>
      </Canvas>
    </>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
createRoot(root).render(<BakePage />);
