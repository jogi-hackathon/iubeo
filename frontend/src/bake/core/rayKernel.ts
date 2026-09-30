// 点ごとに半球方向へレイを撃って AO を数える WebGPU compute カーネル(three-mesh-bvh の BVHComputeData の
// raycastFirstHit)。本ベイク(gpuAO.ts の GpuAOBaker)と隠れチャート判定(GpuHiddenProbe)で共有し、
// AO の式を1か所にまとめる。
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
import { GpuErrorWatch } from "./gpuErrors";
import {
  BIAS,
  type Dir,
  EMBEDDED,
  INSIDE_BACK_RATIO,
  INSIDE_RAYS,
  MAX_DIST,
} from "./params";

const WORKGROUP_SIZE = 64;
const POINT_VEC4 = 4; // 点あたりの入力の vec4 数(発射位置 / 接線 / 従接線 / 法線)

// BVH をパックして storage buffer に載せる(ジオメトリ index / position もここで載る)。
// geometry.boundsTree があれば再利用される。本ベイク・隠れ判定のカーネルで共有する
export const createBVHData = (geometry: BufferGeometry): BVHComputeData => {
  const bvhData = new BVHComputeData(geometry);
  bvhData.update();
  return bvhData;
};

/**
 * AO のほかにレイごとに集計する値(WGSL の断片)。断片からはノードを参照できないので、ローカル変数だけを使う。
 * perRay は MAX_DIST のレイを撃った直後(裏面ヒットで continue する前)に入り、origin / dir が使える。
 * write は out[1] 〜 out[results] に書く(out[0] は AO)
 */
export interface RayKernelExtra {
  results: number;
  decl: string;
  perRay: string;
  write: string;
}

const NO_EXTRA: RayKernelExtra = {
  results: 0,
  decl: "",
  perRay: "",
  write: "",
};

export class RayKernel {
  /** 点あたりの出力数(AO + extra.results) */
  readonly resultsPerPoint: number;
  private readonly renderer: WebGPURenderer;
  private readonly watch: GpuErrorWatch;
  private readonly dirCount: number;
  private readonly data: Float32Array;
  private readonly dataAttr: StorageBufferAttribute;
  private readonly result: StorageBufferAttribute;
  private readonly countUniform: ReturnType<typeof uniform>;
  private readonly kernel: ComputeNode;

  /**
   * @param renderer 初期化済み(await renderer.init())のレンダラー
   * @param bvhData createBVHData の結果
   * @param dirs 接空間(z が法線)のサンプル方向。全点で共有する
   * @param capacity 1回の dispatch で扱える点の数
   */
  constructor(
    renderer: WebGPURenderer,
    bvhData: BVHComputeData,
    dirs: readonly Dir[],
    capacity: number,
    extra: RayKernelExtra = NO_EXTRA,
  ) {
    this.renderer = renderer;
    this.watch = new GpuErrorWatch(renderer);
    this.dirCount = dirs.length;
    const results = 1 + extra.results;
    // 埋まり判定: サンプル方向から等間隔に選んだ insideRays 本を距離無制限で撃つ
    const insideRays = Math.min(INSIDE_RAYS, dirs.length);
    const insideStride = Math.floor(dirs.length / insideRays);
    const insideMin = Math.ceil(insideRays * INSIDE_BACK_RATIO);
    this.resultsPerPoint = results;

    // storage buffer は BVH 側が 4 本使うので、自前は 2 本(入力 1 + 出力 1)に interleave して
    // デフォルト上限(maxStorageBuffersPerShaderStage = 8)に収める。
    // 入力 data(vec4 の並び): 先頭 dirs.length 個がサンプル方向、以降が点ごとに
    // [発射位置(BIAS 込み), 回転込みの接線, 回転込みの従接線, 法線] の 4 個ずつ
    const nDirs = dirs.length;
    this.data = new Float32Array((nDirs + capacity * POINT_VEC4) * 4);
    dirs.forEach((d, i) => {
      this.data[i * 4] = d.x;
      this.data[i * 4 + 1] = d.y;
      this.data[i * 4 + 2] = d.z;
    });
    this.dataAttr = new StorageBufferAttribute(this.data, 4);
    this.result = new StorageBufferAttribute(
      new Uint32Array(capacity * results),
      1,
    );
    const dataNode = storage(
      this.dataAttr,
      "vec4",
      nDirs + capacity * POINT_VEC4,
    ).toReadOnly();
    const resultNode = storage(this.result, "uint", capacity * results);
    this.countUniform = uniform(0, "uint");

    // 距離減衰つき AO: 裏面ヒットは valid から除外、有効レイが半分未満なら EMBEDDED、
    // 有効ヒットは 1 - dist/MAX_DIST を積算。
    // 他の物体に埋まった点(接する箱の内側など)は、距離 MAX_DIST 以内に何にも当たらないレイが有効と数えられて
    // 明るい値が出てしまうので、距離無制限のレイの裏面ヒットの割合でも EMBEDDED にする。round は JS の Math.round(半分は切り上げ)に合わせて floor(x + 0.5)。
    // raycastFirstHit の side は sign(-dot(dir, geometricNormal)): +1 が表面、-1 が裏面
    const kernelFn = wgslTagFn /* wgsl */`
      // fn
      fn castRays(
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

        let base = ${nDirs}u + i * ${POINT_VEC4}u;
        let origin = ${dataNode}[ base ].xyz;
        let tangent = ${dataNode}[ base + 1u ].xyz;
        let bitangent = ${dataNode}[ base + 2u ].xyz;
        let normal = ${dataNode}[ base + 3u ].xyz;

        var occlusion = 0.0;
        var valid = 0u;
        ${extra.decl}
        for ( var k = 0u; k < ${nDirs}u; k = k + 1u ) {

          let d = ${dataNode}[ k ].xyz;
          let dir = tangent * d.x + bitangent * d.y + normal * d.z;
          var ray: Ray;
          ray.origin = origin;
          ray.direction = dir;
          ray.maxDist = ${MAX_DIST};

          var hit: IntersectionResult;
          bvh_RaycastFirstHit( ray, &hit );
          ${extra.perRay}

          if ( hit.didHit && hit.side < 0.0 ) {

            continue;

          }

          valid = valid + 1u;
          if ( hit.didHit ) {

            occlusion = occlusion + ( 1.0 - hit.dist / ${MAX_DIST} );

          }

        }

        var insideBack = 0u;
        for ( var m = 0u; m < ${insideRays}u; m = m + 1u ) {

          let d = ${dataNode}[ m * ${insideStride}u ].xyz;
          var insideRay: Ray;
          insideRay.origin = origin;
          insideRay.direction = tangent * d.x + bitangent * d.y + normal * d.z;
          insideRay.maxDist = 0.0;

          var insideHit: IntersectionResult;
          bvh_RaycastFirstHit( insideRay, &insideHit );
          if ( insideHit.didHit && insideHit.side < 0.0 ) {

            insideBack = insideBack + 1u;

          }

        }

        var ao = ${EMBEDDED}u;
        if ( valid >= ${Math.ceil(nDirs / 2)}u && insideBack < ${insideMin}u ) {

          ao = u32( min( 255.0, floor( ( 1.0 - occlusion / f32( valid ) ) * 255.0 + 0.5 ) ) );

        }

        var out: array<u32, ${results}>;
        out[ 0 ] = ao;
        ${extra.write}
        for ( var j = 0u; j < ${results}u; j = j + 1u ) {

          ${resultNode}[ i * ${results}u + j ] = out[ j ];

        }

      }
    `;

    this.kernel = kernelFn({
      workgroupSize: uniform(new Vector3(WORKGROUP_SIZE, 1, 1)),
      workgroupId,
      localId,
      count: this.countUniform,
    }).computeKernel([WORKGROUP_SIZE]);
  }

  /**
   * n 番目の点を書く。発射位置は法線方向に BIAS だけずらす。
   * frame は rotatedFrame の結果(回転込みの接線 [0..2]・従接線 [3..5])
   */
  setPoint(
    n: number,
    ox: number,
    oy: number,
    oz: number,
    nx: number,
    ny: number,
    nz: number,
    frame: ArrayLike<number>,
  ): void {
    const d = this.data;
    const o = (this.dirCount + n * POINT_VEC4) * 4;
    d[o] = ox + nx * BIAS;
    d[o + 1] = oy + ny * BIAS;
    d[o + 2] = oz + nz * BIAS;
    for (let k = 0; k < 3; k++) {
      d[o + 4 + k] = frame[k] ?? 0;
      d[o + 8 + k] = frame[3 + k] ?? 0;
    }
    d[o + 12] = nx;
    d[o + 13] = ny;
    d[o + 14] = nz;
  }

  /** 先頭から count 点を GPU で計算し、点ごとに resultsPerPoint 個ずつ(先頭が AO: 0..255 / EMBEDDED)返す */
  async dispatch(count: number): Promise<Uint32Array> {
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
        count * this.resultsPerPoint,
      );
    });
  }
}
