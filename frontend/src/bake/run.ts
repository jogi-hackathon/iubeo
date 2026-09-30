import {MeshBVH} from "three-mesh-bvh";
import type {WebGPURenderer} from "three/webgpu";

import {dilateChart, packAtlas, writeChartToAtlas} from "./core/atlas";
import {buildChartTriangles, chartPhysicalSize} from "./core/charts";
import {createBVHData, GpuAOBaker, GpuHiddenProbe} from "./core/gpuAO";
import {type BakedAOLayout, serializeLayout} from "./format";
import {buildBakeGeometry, listBakeMeshes, meshSignature} from "./meshes";

export interface BakeProgress {
  status: string;
  done?: number;
  total?: number;
}

export interface BakeOutput {
  atlas: Uint8Array;
  layout: BakedAOLayout;
  layoutBytes: Uint8Array;
  hiddenCount: number;
  texelTotal: number;
  /** 工程ごとの所要時間(ms) */
  timings: Record<string, number>;
}

/** イベントループへ制御を返す。setTimeout はバックグラウンドタブで間引かれるので MessageChannel を使う */
const yieldToUI = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

/**
 * マウント済みのシーン(BVHCollider でコライダー登録済み)の静的 mesh について AO をベイクする。
 * 手順は移植元(three-room-ao-test)と同じ: 結合ジオメトリ → 隠れチャート判定(GPU)→ アトラス配置
 * → テクセルごとの AO(GPU)→ チャート内 dilate → アトラスへ書き込み
 */
export const bakeSceneAO = async (
  renderer: WebGPURenderer,
  onProgress: (p: BakeProgress) => void,
): Promise<BakeOutput> => {
  const timings: Record<string, number> = {};
  const lap = (name: string, t0: number) => {
    timings[name] = performance.now() - t0;
    console.info(`[bake] ${name}: ${(timings[name] / 1000).toFixed(2)}s`);
  };

  let t0 = performance.now();
  onProgress({status: "ジオメトリ結合・BVH 構築中"});
  await yieldToUI();
  const meshes = listBakeMeshes();
  if (meshes.length === 0) {
    throw new Error(
      "ベイク対象の mesh がありません(BVHCollider 配下の mesh が対象)",
    );
  }
  const signatures = meshes.map(meshSignature);
  const geometry = buildBakeGeometry(meshes);
  const chartCount = geometry.userData.chartCount as number;
  // BVHComputeData は geometry.boundsTree があれば再利用する
  geometry.boundsTree = new MeshBVH(geometry);
  const chartTris = buildChartTriangles(geometry);
  const bvhData = createBVHData(geometry);
  console.info(
    `[bake] meshes=${meshes.length} charts=${chartCount} triangles=${(geometry.index?.count ?? 0) / 3}`,
  );
  lap("geometry+bvh", t0);

  try {
    // 隠れチャート(ほかの面に密着して見えない面)は最小のテクセル数に縮める
    t0 = performance.now();
    const widths = new Float32Array(chartCount);
    const heights = new Float32Array(chartCount);
    chartTris.forEach((tris, c) => {
      const size = chartPhysicalSize(tris);
      widths[c] = size.width;
      heights[c] = size.height;
    });
    const probe = new GpuHiddenProbe(renderer, bvhData);
    const hidden = await probe.analyze(chartTris, (done, total) =>
      onProgress({status: "隠れチャート判定", done, total}),
    );
    const hiddenCount = hidden.reduce((a, b) => a + b, 0);
    lap("hidden", t0);

    t0 = performance.now();
    const packed = packAtlas(chartCount, hidden, widths, heights);
    console.info(
      `[bake] atlas=${packed.atlasW}x${packed.atlasH} fill=${(packed.fill * 100).toFixed(1)}% texels=${packed.texelTotal} hidden=${hiddenCount}/${chartCount}`,
    );
    lap("pack", t0);

    t0 = performance.now();
    const baker = new GpuAOBaker(renderer, bvhData);
    const raws = await baker.bakeCharts(
      chartTris,
      packed.sizes,
      (done, total) => onProgress({status: "AO 計算", done, total}),
    );
    lap("ao", t0);

    t0 = performance.now();
    onProgress({status: "dilate・アトラス生成中"});
    await yieldToUI();
    const atlas = new Uint8Array(packed.atlasW * packed.atlasH).fill(255);
    packed.sizes.forEach(({w, h}, c) => {
      writeChartToAtlas(
        atlas,
        packed.atlasW,
        packed.atlasH,
        packed.rects[c] as (typeof packed.rects)[number],
        w,
        h,
        dilateChart(raws[c] as Int32Array, w, h),
      );
    });
    const layout: BakedAOLayout = {
      atlasW: packed.atlasW,
      atlasH: packed.atlasH,
      meshes: signatures,
      rects: packed.rects,
    };
    lap("atlas", t0);

    return {
      atlas,
      layout,
      layoutBytes: serializeLayout(layout),
      hiddenCount,
      texelTotal: packed.texelTotal,
      timings,
    };
  } finally {
    bvhData.dispose();
    geometry.boundsTree = undefined;
    geometry.dispose();
  }
};
