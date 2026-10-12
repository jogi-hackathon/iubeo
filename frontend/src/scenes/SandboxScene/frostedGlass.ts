import {
  abs,
  cameraProjectionMatrix,
  dot,
  float,
  fract,
  fwidth,
  max,
  mix,
  mx_noise_vec3,
  positionLocal,
  positionView,
  screenSize,
  screenUV,
  smoothstep,
  vec2,
  vec3,
  vec4,
  viewportMipTexture,
} from "three/tsl";
import {MeshBasicNodeMaterial, type Node, type TextureNode} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import type {Vec3} from "../../props/types";

export type FrostedGlassParams = {
  distortion: number;
  noiseFrequency: number;
  noiseDetail: number;
  blurSamples: number;
  blurRadius: number;
  blurMipLevel: number;
  gridSpacing: number;
  gridWidth: number;
  gridWave: number;
  gridTone: number;
  gridOpacity: number;
};

export const FROSTED_GLASS: FrostedGlassParams = {
  distortion: 0.01,
  noiseFrequency: 3,
  noiseDetail: 0.5,
  blurSamples: 1,
  blurRadius: 0.0025,
  blurMipLevel: 1,
  gridSpacing: 0.25,
  gridWidth: 0.008,
  gridWave: 0.012,
  gridTone: 0.6,
  gridOpacity: 0,
};

export const FROSTED_GLASS_RENDER_ORDER = 1;

const DETAIL_SCALE = 2.7;
const DETAIL_OFFSET = [5.2, 1.3] as const;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GRID_FADE_PX = [3.5, 8] as const;

const diskOffsets = (count: number): Array<readonly [number, number]> =>
  Array.from({length: count}, (_, i) => {
    const radius = Math.sqrt((i + 0.5) / count);
    const angle = i * GOLDEN_ANGLE;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  });

const noiseVec2 = (q: Node<"vec2">): Node<"vec2"> => mx_noise_vec3(q).xy;

/**
 * すりガラス(型板ガラス風)のマテリアル。背後(ビューポート)を、ガラスの面に固定したノイズでずらして見せる:
 * 1. 面内座標 (u, v) = (位置·uAxis, y)(mesh のローカル座標。ガラスに固定。向きが違う複数の mesh でも同じ模様になる)でノイズを引き、
 *    screenUV をずらす(ずれは深さに反比例)。そこへ少数の点でごく弱いぼかしをかける。反射・白寄せはしない(背後の明るさをそのまま見せる)
 * 2. 面内座標の細い格子の線を、同じノイズで波打たせて、背景に乗算する(薄いグレー。gridOpacity が 0 なら描かない)
 *
 * viewportMipTexture はこの 1 つのノードだけを作り、sample() で位置を変える(複製は同じフレームバッファを共有するので、
 * ビューポートのコピーは描画あたり 1 回)。マテリアルも複数の mesh で共有すること(マテリアルごとにコピーが走る)。
 * alpha は 1(背後の見え方は、サンプルしたビューポートの色で作る)。透明物なので、不透明物の後に描かれる。
 *
 * @param uAxis ガラスの面の水平方向の軸(mesh のローカル座標の単位ベクトル)。面内座標の横軸
 */
export const createFrostedGlassMaterial = (
  uAxis: Vec3,
  params: FrostedGlassParams = FROSTED_GLASS,
): MeshBasicNodeMaterial => {
  const {
    distortion,
    noiseFrequency,
    noiseDetail,
    blurSamples,
    blurRadius,
    blurMipLevel,
    gridSpacing,
    gridWidth,
    gridWave,
    gridTone,
    gridOpacity,
  } = params;

  const faceUV = vec2(dot(positionLocal, vec3(...uAxis)), positionLocal.y);
  const coord = faceUV.mul(noiseFrequency);
  const noise = noiseVec2(coord)
    .add(
      noiseVec2(coord.mul(DETAIL_SCALE).add(vec2(...DETAIL_OFFSET))).mul(
        noiseDetail,
      ),
    )
    .div(1 + noiseDetail);

  const aspect = vec2(screenSize.y.div(screenSize.x), 1);
  const depth = max(positionView.z.negate(), 0.1);
  const projectionScale = cameraProjectionMatrix.mul(vec4(0, 1, 0, 0)).y;
  const uvPerMeter = projectionScale.div(depth.mul(2));
  const distortedUV = screenUV.add(
    noise.mul(aspect).mul(uvPerMeter.mul(distortion)),
  );

  // 背後の色。弱いぼかし(円盤状の少数の点、mip レベル blurMipLevel の平均)
  // @types/three は viewportMipTexture を Node と型付けているが、実体は TextureNode(sample / level を持つ)
  const viewport = viewportMipTexture() as unknown as TextureNode;
  const spread = aspect.mul(blurRadius);
  const offsets = diskOffsets(blurSamples);
  const sampled = offsets
    .map(
      ([x, y]) =>
        viewport
          .sample(distortedUV.add(spread.mul(vec2(x, y))))
          .level(float(blurMipLevel)).rgb,
    )
    .reduce((sum, c) => sum.add(c));
  const backdrop = sampled.div(offsets.length);

  const gridFactor = (): Node<"float"> => {
    const warped = faceUV.add(noise.mul(gridWave));
    const lineDistance = abs(
      fract(warped.div(gridSpacing).add(0.5)).sub(0.5),
    ).mul(gridSpacing);
    const pixelWidth = max(fwidth(lineDistance), 1e-5);
    const halfWidth = gridWidth / 2;
    const coverage = float(1).sub(
      smoothstep(
        float(halfWidth).sub(pixelWidth),
        float(halfWidth).add(pixelWidth),
        lineDistance,
      ),
    );
    const density = max(pixelWidth.x, pixelWidth.y).div(gridSpacing);
    const fade = float(1).sub(
      smoothstep(1 / GRID_FADE_PX[1], 1 / GRID_FADE_PX[0], density),
    );
    const line = max(coverage.x, coverage.y).mul(fade);
    return mix(float(1), float(gridTone), line.mul(gridOpacity));
  };

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  material.colorNode = vec4(
    gridOpacity > 0 ? backdrop.mul(gridFactor()) : backdrop,
    1,
  );
  setSkipGTAO(material, true);
  return material;
};
