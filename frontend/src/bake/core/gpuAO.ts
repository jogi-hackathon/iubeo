import type {BVHComputeData} from "three-mesh-bvh/webgpu";
// GPU 版の AO 計算。レイを撃つカーネルは rayKernel.ts、ここはチャートのテクセル・サンプル点をチャンクに詰めて
// 回し、結果をチャートへ戻す部分。
// 使い方: const bvhData = createBVHData(geometry); const baker = new GpuAOBaker(renderer, bvhData);
//         const raws = await baker.bakeCharts(chartTris, sizes)
import type {WebGPURenderer} from "three/webgpu";

import {
  buildChartIndex,
  type ChartTri,
  insetPosition,
  queryChart,
} from "./charts";
import {decideHidden, type ProbePoint, rotatedFrame} from "./frame";
import {checkFirstChunk} from "./gpuErrors";
import {EMBEDDED, HIDDEN_DIRS, HIDDEN_UV, rotFor, SAMPLE_DIRS} from "./params";
import {RayKernel, type RayKernelExtra} from "./rayKernel";
import {sampleTexel} from "./texels";

export {createBVHData} from "./rayKernel";

// 1回の dispatch で処理するテクセル数。macOS の GPU ウォッチドッグ(数秒で強制終了)を避けるため、
// 1 dispatch が長くなりすぎない大きさに抑える。重い/軽いに応じて調整する
export const CHUNK_TEXELS = 131072;

// ---------------------------------------------------------------- 本ベイク

export type BakeStats = {sampleMs: number; gpuMs: number; chunks: number};

// テクセルごとに SAMPLE_DIRS(96 方向)の半球サンプルで AO を計算する
export class GpuAOBaker {
  private readonly kernel: RayKernel;
  private readonly chunkTexels: number;
  /** 直近の bakeCharts の計測値。CPU 側のサンプル生成 / GPU 実行+読み戻しの累計 */
  stats: BakeStats = {sampleMs: 0, gpuMs: 0, chunks: 0};

  /**
   * @param renderer 初期化済み(await renderer.init())のレンダラー
   * @param bvhData createBVHData の結果
   */
  constructor(
    renderer: WebGPURenderer,
    bvhData: BVHComputeData,
    chunkTexels = CHUNK_TEXELS,
  ) {
    this.chunkTexels = chunkTexels;
    this.kernel = new RayKernel(renderer, bvhData, SAMPLE_DIRS, chunkTexels);
  }

  /**
   * 全チャートの生の AO(0..255、無効は -1。dilate 前)を返す。
   * @param chartTris buildChartTriangles の結果
   * @param sizes チャートごとのテクセル数
   * @param onProgress チャンクごとに呼ぶ(done/total はテクセル数)
   */
  async bakeCharts(
    chartTris: ChartTri[][],
    sizes: {w: number; h: number}[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Int32Array[]> {
    const chartCount = chartTris.length;
    const raws = sizes.map(({w, h}) => new Int32Array(w * h).fill(-1));
    let total = 0;
    for (const {w, h} of sizes) {
      total += w * h;
    }

    const chartOf = new Uint32Array(this.chunkTexels);
    const texelOf = new Uint32Array(this.chunkTexels);
    const frame = new Float64Array(6);
    const stats: BakeStats = {sampleMs: 0, gpuMs: 0, chunks: 0};
    this.stats = stats;
    let c = 0; // 次に処理するチャート
    let t = 0; // チャート内の次のテクセル(ty * w + tx)
    let idx: ReturnType<typeof buildChartIndex> | null = null; // チャートごとに1度だけ作る
    let visited = 0;

    for (;;) {
      // チャンクを埋める。無効テクセル(どの三角形にも載らない)は飛ばす
      const tSample = performance.now();
      let n = 0;
      while (n < this.chunkTexels && c < chartCount) {
        const size = sizes[c];
        const tris = chartTris[c];
        if (!size || !tris) {
          throw new Error(`[bake] チャート ${c} の情報がありません`);
        }
        const {w, h} = size;
        if (t >= w * h) {
          c++;
          t = 0;
          idx = null;
          continue;
        }
        if (!idx) {
          idx = buildChartIndex(tris);
        }
        const tx = t % w;
        const ty = (t - tx) / w;
        const s = sampleTexel(idx, c, w, h, tx, ty);
        t++;
        visited++;
        if (!s) {
          continue;
        }
        rotatedFrame(s.nx, s.ny, s.nz, s.rot, frame);
        this.kernel.setPoint(n, s.ox, s.oy, s.oz, s.nx, s.ny, s.nz, frame);
        chartOf[n] = c;
        texelOf[n] = t - 1;
        n++;
      }
      stats.sampleMs += performance.now() - tSample;
      if (n === 0) {
        break;
      }

      const tGpu = performance.now();
      const ao = await this.kernel.dispatch(n);
      stats.gpuMs += performance.now() - tGpu;
      stats.chunks++;
      if (stats.chunks === 1) {
        checkFirstChunk("AO", ao, n);
      }
      for (let i = 0; i < n; i++) {
        const v = ao[i] as number;
        const raw = raws[chartOf[i] as number];
        if (v !== EMBEDDED && raw) {
          raw[texelOf[i] as number] = v;
        }
      }
      if (onProgress) {
        onProgress(visited, total);
      }
    }
    return raws;
  }
}

// ---------------------------------------------------------------- 隠れチャート判定

const HIDDEN_POINTS = HIDDEN_UV.length * HIDDEN_UV.length; // チャートあたりのサンプル点

export type ProbeStats = {
  sampleMs: number;
  gpuMs: number;
  chunks: number;
  points: number;
};

// AO に加えて、同じ方向で距離無制限(maxDist = 0 は無制限)のレイを撃ち、裏面に当たった本数と何にも当たらなかった本数を数える
const VISIBILITY: RayKernelExtra = {
  results: 2,
  decl: "var backHits = 0u; var misses = 0u;",
  perRay: /* wgsl */ `
          var farRay: Ray;
          farRay.origin = origin;
          farRay.direction = dir;
          farRay.maxDist = 0.0;
          var farHit: IntersectionResult;
          bvh_RaycastFirstHit( farRay, &farHit );
          if ( ! farHit.didHit ) {

            misses = misses + 1u;

          } else if ( farHit.side < 0.0 ) {

            backHits = backHits + 1u;

          }`,
  write: "out[ 1 ] = backHits; out[ 2 ] = misses;",
};

// 隠れチャート判定のレイキャスト部分を GPU で回す。サンプル点(チャートごとの 3x3)ごとに
// 本ベイクと同じ式の AO(HIDDEN_DIRS、シード chartId*4 + s*2 + 1)と VISIBILITY の本数を出し、
// 判定(frame.ts の decideHidden)は CPU で行う。移植元からの判定の変更点は frame.ts の isHiddenPoint のコメントを参照。
export class GpuHiddenProbe {
  private readonly kernel: RayKernel;
  private readonly chunkPoints: number;
  /** 直近の analyze の計測値 */
  stats: ProbeStats = {sampleMs: 0, gpuMs: 0, chunks: 0, points: 0};

  constructor(
    renderer: WebGPURenderer,
    bvhData: BVHComputeData,
    chunkPoints = CHUNK_TEXELS,
  ) {
    // 1チャート分のサンプル点が入らないと analyze が進まなくなる
    if (chunkPoints < HIDDEN_POINTS) {
      throw new Error(
        `[bake] chunkPoints は ${HIDDEN_POINTS} 以上にしてください(${chunkPoints})`,
      );
    }
    this.chunkPoints = chunkPoints;
    this.kernel = new RayKernel(
      renderer,
      bvhData,
      HIDDEN_DIRS,
      chunkPoints,
      VISIBILITY,
    );
  }

  /**
   * 全チャートの隠れフラグ(1 = 隠れ)を返す。
   * @param chartTris buildChartTriangles の結果
   * @param onProgress チャンクごとに呼ぶ(done/total はチャート数)
   */
  async analyze(
    chartTris: ChartTri[][],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Uint8Array> {
    const chartCount = chartTris.length;
    const hidden = new Uint8Array(chartCount);
    const stats: ProbeStats = {sampleMs: 0, gpuMs: 0, chunks: 0, points: 0};
    this.stats = stats;
    const rays = HIDDEN_DIRS.length;
    const stride = this.kernel.resultsPerPoint;
    const pointChart = new Uint32Array(this.chunkPoints);
    const pointNy = new Float32Array(this.chunkPoints);
    const frame = new Float64Array(6);
    let c = 0;

    while (c < chartCount) {
      // チャートのサンプル点は同じチャンクに収める(判定をチャンク内で完結させる)
      const tSample = performance.now();
      let n = 0;
      while (c < chartCount && n + HIDDEN_POINTS <= this.chunkPoints) {
        const idx = buildChartIndex(chartTris[c] ?? []);
        let si = 0;
        for (const v of HIDDEN_UV) {
          for (const u of HIDDEN_UV) {
            const hit = queryChart(idx, u, v);
            if (hit) {
              const [px, py, pz] = insetPosition(hit);
              // AO 用のシード(移植元と同じ c*4 + si*2 + 1)
              rotatedFrame(
                hit.nx,
                hit.ny,
                hit.nz,
                rotFor(c * 4 + si * 2 + 1),
                frame,
              );
              this.kernel.setPoint(
                n,
                px,
                py,
                pz,
                hit.nx,
                hit.ny,
                hit.nz,
                frame,
              );
              pointChart[n] = c;
              pointNy[n] = hit.ny;
              n++;
            }
            si++;
          }
        }
        c++;
      }
      stats.sampleMs += performance.now() - tSample;
      if (n === 0) {
        continue;
      }

      const tGpu = performance.now();
      const r = await this.kernel.dispatch(n);
      stats.gpuMs += performance.now() - tGpu;
      stats.chunks++;
      stats.points += n;
      const points: ProbePoint[] = [];
      for (let i = 0; i < n; i++) {
        points.push({
          ao: r[i * stride] as number,
          backHits: r[i * stride + 1] as number,
          misses: r[i * stride + 2] as number,
          ny: pointNy[i] as number,
        });
      }
      if (stats.chunks === 1) {
        checkFirstChunk(
          "隠れ判定 AO",
          points.map((p) => p.ao),
          n,
        );
      }

      // 同じチャートの点は連続して並んでいるので、区切りごとに判定する
      for (let start = 0; start < n;) {
        const chart = pointChart[start] as number;
        let end = start + 1;
        while (end < n && pointChart[end] === chart) {
          end++;
        }
        hidden[chart] = decideHidden(points.slice(start, end), rays) ? 1 : 0;
        start = end;
      }
      if (onProgress) {
        onProgress(c, chartCount);
      }
    }
    return hidden;
  }
}
