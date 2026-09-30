// GPU 版の AO 計算。テクセルごとに 96 方向の半球サンプルを、WebGPU compute + three-mesh-bvh の
// BVHComputeData(raycastFirstHit)で回す。
// 使い方: const bvhData = createBVHData(geometry); const baker = new GpuAOBaker(renderer, bvhData);
//         const raws = await baker.bakeCharts(chartTris, sizes)
// three-mesh-bvh の WebGPU API は unstable。使い方は node_modules/three-mesh-bvh/src/webgpu/ と
// 同リポジトリの example/webgpu_gpuPathTracingSimple.js に合わせている。
import type { BufferGeometry } from "three";
import { localId, storage, uniform, workgroupId } from "three/tsl";
import {
  type ComputeNode,
  StorageBufferAttribute,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { BVHComputeData, wgslTagFn } from "three-mesh-bvh/webgpu";
import {
  buildChartIndex,
  type ChartTri,
  insetPosition,
  queryChart,
} from "./charts";
import { decideHidden, rotatedFrame } from "./frame";
import {
  BIAS,
  EMBEDDED,
  HIDDEN_DIRS,
  HIDDEN_UV,
  MAX_DIST,
  rotFor,
  SAMPLE_DIRS,
  SAMPLES,
} from "./params";
import { sampleTexel } from "./texels";

// 1回の dispatch で処理するテクセル数。macOS の GPU ウォッチドッグ(数秒で強制終了)を避けるため、
// 1 dispatch が長くなりすぎない大きさに抑える。重い/軽いに応じて調整する
export const CHUNK_TEXELS = 131072;
const WORKGROUP_SIZE = 64;
const TEXEL_VEC4 = 4; // フェーズ2: テクセルあたりの vec4 数(origin / T / B / N)
const PROBE_VEC4 = 4; // フェーズ1: サンプル点あたりの vec4 数(origin / N / 接線 / 従接線)

// ---------------------------------------------------------------- GPU エラー検知

// renderer.backend.device は three の型に無いので、使う分だけ狭める
type GpuDeviceLike = {
  addEventListener(
    type: "uncapturederror",
    listener: (e: { error?: { message?: string } }) => void,
  ): void;
  pushErrorScope(filter: "validation" | "out-of-memory"): void;
  popErrorScope(): Promise<{ message: string } | null>;
};

// GPU のバリデーションエラー(バインドグループ不正、パイプライン作成失敗など)を確実に検知する。
// three は Uncaptured エラーを console に出すだけで例外にしないため、device のエラーイベントと
// pushErrorScope の両方で拾い、run() の結果と一緒に例外として投げる
export class GpuErrorWatch {
  private readonly device: GpuDeviceLike;
  private readonly errors: string[] = [];

  constructor(renderer: WebGPURenderer) {
    const backend = renderer.backend as unknown as { device?: GpuDeviceLike };
    if (!backend.device) {
      throw new Error(
        "[bake] WebGPU デバイスが取得できません(renderer.init() 済みか確認)",
      );
    }
    this.device = backend.device;
    this.device.addEventListener("uncapturederror", (e) =>
      this.errors.push(e.error?.message ?? String(e.error)),
    );
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const { device } = this;
    device.pushErrorScope("validation");
    device.pushErrorScope("out-of-memory");
    let result: T | undefined;
    let thrown: unknown = null;
    try {
      result = await fn();
    } catch (e) {
      thrown = e;
    }
    const oom = await device.popErrorScope();
    const validation = await device.popErrorScope();
    const messages = [...this.errors];
    this.errors.length = 0;
    if (validation) messages.push(validation.message);
    if (oom) messages.push(`out-of-memory: ${oom.message}`);
    if (messages.length) {
      throw new Error(
        `WebGPU エラー: ${messages[0]}${messages.length > 1 ? ` (ほか ${messages.length - 1} 件)` : ""}`,
      );
    }
    if (thrown) throw thrown;
    return result as T;
  }
}

// 最初のチャンクの結果が明らかに異常(全部 0 / 全部 EMBEDDED)なら止める。
// 実行に失敗したカーネルは読み戻しが全 0 になるため、その見逃しを防ぐ
export const checkFirstChunk = (
  label: string,
  values: ArrayLike<number>,
  n: number,
): void => {
  if (n < 64) return;
  const first = values[0];
  if (first !== 0 && first !== EMBEDDED) return;
  for (let i = 1; i < n; i++) if (values[i] !== first) return;
  throw new Error(
    `GPU の出力が異常です(${label} の先頭チャンク ${n} 件がすべて ${first === EMBEDDED ? "EMBEDDED" : first})`,
  );
};

// BVH をパックして storage buffer に載せる(ジオメトリ index / position もここで載る)。
// geometry.boundsTree があれば再利用される。フェーズ1・2 のカーネルで共有する
export const createBVHData = (geometry: BufferGeometry): BVHComputeData => {
  const bvhData = new BVHComputeData(geometry);
  bvhData.update();
  return bvhData;
};

// ---------------------------------------------------------------- フェーズ2(本ベイク)

export type BakeStats = { sampleMs: number; gpuMs: number; chunks: number };

export class GpuAOBaker {
  private readonly renderer: WebGPURenderer;
  private readonly chunkTexels: number;
  private readonly watch: GpuErrorWatch;
  private readonly data: Float32Array;
  private readonly dataAttr: StorageBufferAttribute;
  private readonly result: StorageBufferAttribute;
  private readonly countUniform: ReturnType<typeof uniform>;
  private readonly kernel: ComputeNode;
  /** 直近の bakeCharts の計測値。CPU 側のサンプル生成 / GPU 実行+読み戻しの累計 */
  stats: BakeStats = { sampleMs: 0, gpuMs: 0, chunks: 0 };

  /**
   * @param renderer 初期化済み(await renderer.init())のレンダラー
   * @param bvhData createBVHData の結果
   */
  constructor(
    renderer: WebGPURenderer,
    bvhData: BVHComputeData,
    chunkTexels = CHUNK_TEXELS,
  ) {
    this.renderer = renderer;
    this.chunkTexels = chunkTexels;
    this.watch = new GpuErrorWatch(renderer);

    // storage buffer は BVH 側が 4 本使うので、自前は 2 本(入力 1 + 出力 1)に interleave して
    // デフォルト上限(maxStorageBuffersPerShaderStage = 8)に収める。
    // 入力 data(vec4 の並び): 先頭 SAMPLES 個がサンプル方向、以降がテクセルごとに
    // [発射位置(BIAS 込み), 回転込みの接線 T, 従接線 B, 法線] の 4 個ずつ
    const n = chunkTexels;
    this.data = new Float32Array((SAMPLES + n * TEXEL_VEC4) * 4);
    SAMPLE_DIRS.forEach((d, i) => {
      this.data[i * 4] = d.x;
      this.data[i * 4 + 1] = d.y;
      this.data[i * 4 + 2] = d.z;
    });
    this.dataAttr = new StorageBufferAttribute(this.data, 4);
    this.result = new StorageBufferAttribute(new Uint32Array(n), 1);
    const dataNode = storage(
      this.dataAttr,
      "vec4",
      SAMPLES + n * TEXEL_VEC4,
    ).toReadOnly();
    const resultNode = storage(this.result, "uint", n);

    this.countUniform = uniform(0, "uint");

    // 距離減衰つき AO: 裏面ヒットは valid から除外、有効レイが半分未満なら EMBEDDED、
    // 有効ヒットは 1 - dist/MAX_DIST を積算。round は JS の Math.round(半分は切り上げ)に合わせて floor(x + 0.5)。
    // raycastFirstHit の side は sign(-dot(dir, geometricNormal)): +1 が表面、-1 が裏面
    const kernelFn = wgslTagFn /* wgsl */`
      // fn
      fn bakeAO(
        workgroupSize: vec3u,
        workgroupId: vec3u,
        localId: vec3u,
        count: u32
      ) -> void {

        ${[bvhData.fns.raycastFirstHit]}

        let i = workgroupSize.x * workgroupId.x + localId.x;
        if ( i >= count ) {

          return;

        }

        let base = ${SAMPLES}u + i * ${TEXEL_VEC4}u;
        let origin = ${dataNode}[ base ].xyz;
        let tangent = ${dataNode}[ base + 1u ].xyz;
        let bitangent = ${dataNode}[ base + 2u ].xyz;
        let normal = ${dataNode}[ base + 3u ].xyz;

        var occlusion = 0.0;
        var valid = 0u;
        for ( var k = 0u; k < ${SAMPLES}u; k = k + 1u ) {

          let d = ${dataNode}[ k ].xyz;
          var ray: Ray;
          ray.origin = origin;
          ray.direction = tangent * d.x + bitangent * d.y + normal * d.z;
          ray.maxDist = ${MAX_DIST};

          var hit: IntersectionResult;
          bvh_RaycastFirstHit( ray, &hit );

          if ( hit.didHit && hit.side < 0.0 ) {

            continue;

          }

          valid = valid + 1u;
          if ( hit.didHit ) {

            occlusion = occlusion + ( 1.0 - hit.dist / ${MAX_DIST} );

          }

        }

        var ao = ${EMBEDDED}u;
        if ( valid >= ${Math.ceil(SAMPLES / 2)}u ) {

          ao = u32( min( 255.0, floor( ( 1.0 - occlusion / f32( valid ) ) * 255.0 + 0.5 ) ) );

        }
        ${resultNode}[ i ] = ao;

      }
    `;

    this.kernel = kernelFn({
      workgroupSize: uniform(new Vector3(WORKGROUP_SIZE, 1, 1)),
      workgroupId,
      localId,
      count: this.countUniform,
    }).computeKernel([WORKGROUP_SIZE]);
  }

  // チャンクの先頭から count 件を GPU で計算して AO(0..255 / EMBEDDED)を返す
  private async dispatch(count: number): Promise<Uint32Array> {
    const { renderer } = this;
    this.dataAttr.needsUpdate = true;
    this.countUniform.value = count;
    return this.watch.run(async () => {
      await renderer.computeAsync(this.kernel, [
        Math.ceil(count / WORKGROUP_SIZE),
        1,
        1,
      ]);
      const buf = await renderer.getArrayBufferAsync(this.result);
      return new Uint32Array(buf, 0, count);
    });
  }

  /**
   * 全チャートの生の AO(0..255、無効は -1。dilate 前)を返す。
   * @param chartTris buildChartTriangles の結果
   * @param sizes チャートごとのテクセル数
   * @param onProgress チャンクごとに呼ぶ(done/total はテクセル数)
   */
  async bakeCharts(
    chartTris: ChartTri[][],
    sizes: { w: number; h: number }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Int32Array[]> {
    const chartCount = chartTris.length;
    const raws = sizes.map(({ w, h }) => new Int32Array(w * h).fill(-1));
    let total = 0;
    for (const { w, h } of sizes) total += w * h;

    const chartOf = new Uint32Array(this.chunkTexels);
    const texelOf = new Uint32Array(this.chunkTexels);
    const frame = new Float64Array(6);
    const stats: BakeStats = { sampleMs: 0, gpuMs: 0, chunks: 0 };
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
        if (!size || !tris)
          throw new Error(`[bake] チャート ${c} の情報がありません`);
        const { w, h } = size;
        if (t >= w * h) {
          c++;
          t = 0;
          idx = null;
          continue;
        }
        if (!idx) idx = buildChartIndex(tris);
        const tx = t % w;
        const ty = (t - tx) / w;
        const s = sampleTexel(idx, c, w, h, tx, ty);
        t++;
        visited++;
        if (!s) continue;
        rotatedFrame(s.nx, s.ny, s.nz, s.rot, frame);
        const o = (SAMPLES + n * TEXEL_VEC4) * 4;
        const d = this.data;
        d[o] = s.ox + s.nx * BIAS;
        d[o + 1] = s.oy + s.ny * BIAS;
        d[o + 2] = s.oz + s.nz * BIAS;
        d[o + 4] = frame[0] ?? 0;
        d[o + 5] = frame[1] ?? 0;
        d[o + 6] = frame[2] ?? 0;
        d[o + 8] = frame[3] ?? 0;
        d[o + 9] = frame[4] ?? 0;
        d[o + 10] = frame[5] ?? 0;
        d[o + 12] = s.nx;
        d[o + 13] = s.ny;
        d[o + 14] = s.nz;
        chartOf[n] = c;
        texelOf[n] = t - 1;
        n++;
      }
      stats.sampleMs += performance.now() - tSample;
      if (n === 0) break;

      const tGpu = performance.now();
      const ao = await this.dispatch(n);
      stats.gpuMs += performance.now() - tGpu;
      stats.chunks++;
      if (stats.chunks === 1) checkFirstChunk("AO", ao, n);
      for (let i = 0; i < n; i++) {
        const v = ao[i] as number;
        const raw = raws[chartOf[i] as number];
        if (v !== EMBEDDED && raw) raw[texelOf[i] as number] = v;
      }
      if (onProgress) onProgress(visited, total);
    }
    return raws;
  }
}

// ---------------------------------------------------------------- フェーズ1(隠れチャート判定)

const HIDDEN_POINTS = HIDDEN_UV.length * HIDDEN_UV.length; // チャートあたりのサンプル点

export type ProbeStats = {
  sampleMs: number;
  gpuMs: number;
  chunks: number;
  points: number;
};

// 隠れチャート判定のレイキャスト部分を GPU で回す。サンプル点(チャートごとの 3x3)ごとに
// 本ベイクと同じ式の AO(HIDDEN_DIRS、MAX_DIST、シード chartId*4 + s*2 + 1)だけを撃ち、
// 判定(decideHidden)は CPU で行う。
//
// 移植元にあった「距離無制限のレイが何にも当たらない比率」(miss)による判定は廃止した。
// IUBEO は屋外のオープンワールドで、床や壁の上面のように空が見える面が正当に存在し、
// miss 判定だとそれらまで隠れチャート(2x2 テクセル)に潰れてしまうため。
export class GpuHiddenProbe {
  private readonly renderer: WebGPURenderer;
  private readonly chunkPoints: number;
  private readonly watch: GpuErrorWatch;
  private readonly data: Float32Array;
  private readonly dataAttr: StorageBufferAttribute;
  private readonly result: StorageBufferAttribute;
  private readonly countUniform: ReturnType<typeof uniform>;
  private readonly kernel: ComputeNode;
  /** 直近の analyze の計測値 */
  stats: ProbeStats = { sampleMs: 0, gpuMs: 0, chunks: 0, points: 0 };

  constructor(
    renderer: WebGPURenderer,
    bvhData: BVHComputeData,
    chunkPoints = CHUNK_TEXELS,
  ) {
    this.renderer = renderer;
    this.chunkPoints = chunkPoints;
    this.watch = new GpuErrorWatch(renderer);

    // storage buffer は BVH 側が 4 本使うので、自前は入力 1 + 出力 1 に interleave する。
    // 入力 data(vec4 の並び): 先頭 HIDDEN_RAYS 個がサンプル方向、以降が点ごとに
    // [発射位置(BIAS 込み), 法線, 回転込みの接線, 回転込みの従接線] の 4 個ずつ。
    // 出力 result: 点ごとに ao の 1 要素
    const n = chunkPoints;
    const rays = HIDDEN_DIRS.length;
    this.data = new Float32Array((rays + n * PROBE_VEC4) * 4);
    HIDDEN_DIRS.forEach((d, i) => {
      this.data[i * 4] = d.x;
      this.data[i * 4 + 1] = d.y;
      this.data[i * 4 + 2] = d.z;
    });
    this.dataAttr = new StorageBufferAttribute(this.data, 4);
    this.result = new StorageBufferAttribute(new Uint32Array(n), 1);
    const dataNode = storage(
      this.dataAttr,
      "vec4",
      rays + n * PROBE_VEC4,
    ).toReadOnly();
    const resultNode = storage(this.result, "uint", n);

    this.countUniform = uniform(0, "uint");

    // 本ベイクと同じ式(距離減衰つき AO)。有効レイが HIDDEN_RAYS の半分未満なら EMBEDDED
    const kernelFn = wgslTagFn /* wgsl */`
      // fn
      fn probeHidden(
        workgroupSize: vec3u,
        workgroupId: vec3u,
        localId: vec3u,
        count: u32
      ) -> void {

        ${[bvhData.fns.raycastFirstHit]}

        let i = workgroupSize.x * workgroupId.x + localId.x;
        if ( i >= count ) {

          return;

        }

        let base = ${rays}u + i * ${PROBE_VEC4}u;
        let origin = ${dataNode}[ base ].xyz;
        let normal = ${dataNode}[ base + 1u ].xyz;
        let tangent = ${dataNode}[ base + 2u ].xyz;
        let bitangent = ${dataNode}[ base + 3u ].xyz;

        var occlusion = 0.0;
        var valid = 0u;
        for ( var k = 0u; k < ${rays}u; k = k + 1u ) {

          let d = ${dataNode}[ k ].xyz;
          var ray: Ray;
          ray.origin = origin;
          ray.direction = tangent * d.x + bitangent * d.y + normal * d.z;
          ray.maxDist = ${MAX_DIST};

          var hit: IntersectionResult;
          bvh_RaycastFirstHit( ray, &hit );

          if ( hit.didHit && hit.side < 0.0 ) {

            continue;

          }

          valid = valid + 1u;
          if ( hit.didHit ) {

            occlusion = occlusion + ( 1.0 - hit.dist / ${MAX_DIST} );

          }

        }

        var ao = ${EMBEDDED}u;
        if ( valid >= ${Math.ceil(rays / 2)}u ) {

          ao = u32( min( 255.0, floor( ( 1.0 - occlusion / f32( valid ) ) * 255.0 + 0.5 ) ) );

        }
        ${resultNode}[ i ] = ao;

      }
    `;

    this.kernel = kernelFn({
      workgroupSize: uniform(new Vector3(WORKGROUP_SIZE, 1, 1)),
      workgroupId,
      localId,
      count: this.countUniform,
    }).computeKernel([WORKGROUP_SIZE]);
  }

  private async dispatch(count: number): Promise<Uint32Array> {
    const { renderer } = this;
    this.dataAttr.needsUpdate = true;
    this.countUniform.value = count;
    return this.watch.run(async () => {
      await renderer.computeAsync(this.kernel, [
        Math.ceil(count / WORKGROUP_SIZE),
        1,
        1,
      ]);
      return new Uint32Array(
        await renderer.getArrayBufferAsync(this.result),
        0,
        count,
      );
    });
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
    const stats: ProbeStats = { sampleMs: 0, gpuMs: 0, chunks: 0, points: 0 };
    this.stats = stats;
    const data = this.data;
    const rays = HIDDEN_DIRS.length;
    const pointChart = new Uint32Array(this.chunkPoints);
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
              const pos = insetPosition(hit);
              const o = (rays + n * PROBE_VEC4) * 4;
              data[o] = pos[0] + hit.nx * BIAS;
              data[o + 1] = pos[1] + hit.ny * BIAS;
              data[o + 2] = pos[2] + hit.nz * BIAS;
              data[o + 4] = hit.nx;
              data[o + 5] = hit.ny;
              data[o + 6] = hit.nz;
              // AO 用のシード(移植元と同じ c*4 + si*2 + 1)
              rotatedFrame(
                hit.nx,
                hit.ny,
                hit.nz,
                rotFor(c * 4 + si * 2 + 1),
                frame,
              );
              for (let k = 0; k < 3; k++) {
                data[o + 8 + k] = frame[k] ?? 0;
                data[o + 12 + k] = frame[3 + k] ?? 0;
              }
              pointChart[n++] = c;
            }
            si++;
          }
        }
        c++;
      }
      stats.sampleMs += performance.now() - tSample;
      if (n === 0) continue;

      const tGpu = performance.now();
      const ao = await this.dispatch(n);
      stats.gpuMs += performance.now() - tGpu;
      stats.chunks++;
      stats.points += n;
      if (stats.chunks === 1) checkFirstChunk("隠れ判定 AO", ao, n);

      // 同じチャートの点は連続して並んでいるので、区切りごとに判定する
      for (let start = 0; start < n; ) {
        const chart = pointChart[start] as number;
        let end = start + 1;
        while (end < n && pointChart[end] === chart) end++;
        hidden[chart] = decideHidden(ao.subarray(start, end)) ? 1 : 0;
        start = end;
      }
      if (onProgress) onProgress(c, chartCount);
    }
    return hidden;
  }
}
