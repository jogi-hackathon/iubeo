import {
  abs,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  mix,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  MeshBasicNodeMaterial,
  type Node,
  type Texture,
  Vector2,
} from "three/webgpu";

/**
 * ブラウン管の画面マテリアル（TSL）。iubeo は WebGPU レンダラなので、GLSL を差し込む
 * onBeforeCompile ではなく、同じ式を TSL のノードで組む。
 *
 * 意図的な判断が 2 つある:
 *
 *  1. 樽型の歪みは UV ではなくジオメトリで作る（curvedScreen.ts）。画面メッシュは本当に曲面なので、
 *     レイキャストの uv がそのまま正確で、クリックは見た目どおりの位置に着く。
 *  2. 色は three の色管理に任せる。テクスチャのサンプリングで sRGB → linear に変換され、出力で戻る。
 *     ブラウザの内容が実機と同じ見た目になる。
 *
 * それ以外（アパーチャーグリル、走査線、減光、ガラスの映り込み、電源投入時のラスタ収縮、ポインタの目印）は、
 * テクスチャの読み出しの後、線形の色の上で行う。
 */

export type CrtControls = {
  material: MeshBasicNodeMaterial;
  /** 電源の立ち上がり 0..1 */
  on: {value: number};
  /** 起動成功後のラスタ展開 0..1 */
  boot: {value: number};
  time: {value: number};
  /** ポインタ位置（UV）。x < 0 で目印を隠す */
  cursor: {value: Vector2};
  cursorOn: {value: number};
};

export const createCrtMaterial = (
  map: Texture,
  width: number,
  height: number,
): CrtControls => {
  const uTime = uniform(0);
  const uOn = uniform(0);
  const uBoot = uniform(0);
  const uCursor = uniform(new Vector2(-1, -1));
  const uCursorOn = uniform(0);
  const uResolution = uniform(new Vector2(width, height));
  const uMask = float(0.55);
  const uScanline = float(0.7);

  const uvNode = uv();
  const c = uvNode.sub(vec2(0.5, 0.5));

  // 燐光の色ずれ: 赤と青は緑より少し外れる。端ほど強い
  const aberr = dot(c, c).mul(0.0024);
  let col: Node<"vec3"> = vec3(
    texture(map, uvNode.add(c.mul(aberr))).r,
    texture(map, uvNode).g,
    texture(map, uvNode.sub(c.mul(aberr))).b,
  );

  // アパーチャーグリル（縦の 3 色）と走査線（横）。周期は画面の上で決める（fwidth）ので、
  // どの距離でもおよそ 2 画素に 1 周期になり、縮小時にモアレが出ない
  const texel = max(fwidth(uvNode), vec2(1, 1).div(uResolution));
  const grille = sin(uvNode.x.mul(Math.PI).div(texel.x)).mul(0.5).add(0.5);
  col = col.mul(float(1).sub(uMask.mul(0.26).mul(grille)));
  const scan = sin(uvNode.y.mul(Math.PI).div(texel.y)).mul(0.5).add(0.5);
  col = col.mul(float(1).sub(uScanline.mul(0.3).mul(scan)));

  // 管の減光と、わずかなにじみ
  const tubeR = length(c.mul(vec2(1, 0.88))).mul(1.34);
  const vig = float(1).sub(smoothstep(0.18, 1.0, tubeR));
  col = col.mul(mix(0.62, 1.0, vig));
  col = col.add(col.mul(vig).mul(0.18));

  // 燐光の応答。白いページが完全な白に張り付かず、グリルのコントラストも残る
  col = col.div(float(1).add(col.mul(0.22)));

  // 室内の光を映す曲面ガラス。管が暗いほど目立つ
  const sheen = float(1).sub(
    smoothstep(0.0, 0.95, length(c.sub(vec2(-0.3, 0.36)))),
  );
  col = col.add(
    vec3(0.03, 0.036, 0.048)
      .mul(sheen)
      .mul(mix(1.0, 0.45, uOn)),
  );

  // 電源投入: ラスタは線に潰れてから広がる
  const tube = mix(0.006, 1.0, clamp(uBoot, 0, 1));
  const y = abs(c.y).mul(2);
  col = col.mul(float(1).sub(smoothstep(tube, tube.add(0.012), y)));
  // 広がるラスタの明るい縁
  const band = abs(y.sub(tube));
  col = col.add(
    vec3(0.65, 0.8, 1.0)
      .mul(float(1).sub(smoothstep(0, 0.09, band)))
      .mul(float(1).sub(tube))
      .mul(1.7),
  );
  // 落ち着くまでのラスタのノイズ
  const noise = fract(
    sin(
      dot(uvNode.mul(uResolution).add(uTime.mul(13)), vec2(12.9898, 78.233)),
    ).mul(43758.5453),
  );
  col = col.add(noise.sub(0.5).mul(0.13).mul(float(1).sub(tube)));

  // 電源ユニットの立ち上がり、ハム、わずかなちらつき
  col = col.mul(uOn);
  col = col.add(vec3(0.01, 0.012, 0.02).mul(float(1).sub(uOn)));
  const hum = sin(uvNode.y.mul(7).add(uTime.mul(0.7)))
    .mul(0.5)
    .add(0.5);
  col = col.add(vec3(0.006).mul(hum).mul(float(1).sub(tube)));
  col = col.mul(float(1).add(sin(uTime.mul(43)).mul(0.014).mul(uOn)));

  // ポインタの位置の目印（レイキャストの位置と、見た目を一致させる）
  const cursorD = uvNode.sub(uCursor).mul(uResolution.div(uResolution.y));
  const ring = float(1).sub(
    smoothstep(0.004, 0.012, abs(length(cursorD).sub(0.021))),
  );
  const cursorShown = step(0, uCursor.x).mul(uCursorOn);
  col = mix(col, vec3(1).sub(col.mul(0.65)), ring.mul(cursorShown).mul(0.85));

  const material = new MeshBasicNodeMaterial();
  material.colorNode = vec4(col, 1);
  // ブラウザの内容を作者の意図どおりに見せる。トーンマッピングを掛けない
  material.toneMapped = false;
  material.fog = false;

  return {
    material,
    on: uOn,
    boot: uBoot,
    time: uTime,
    cursor: uCursor,
    cursorOn: uCursorOn,
  };
};
