import {
  abs,
  attribute,
  float,
  floor,
  fract,
  fwidth,
  max,
  min,
  mix,
  sin,
  smoothstep,
  step,
  vec3,
  vertexColor,
} from "three/tsl";
import {
  type BoxGeometry,
  InstancedBufferAttribute,
  MeshStandardNodeMaterial,
  type Node,
} from "three/webgpu";

import type {Vec3} from "../../props/types";
import {
  BAND_POSITION,
  BAND_STRENGTH,
  BAND_WIDTH,
  COVER_RATIO_MAX,
  COVER_THICKNESS,
  FRAME_INSET,
  FRAME_STRENGTH,
  FRAME_WIDTH,
  PAGE_SHADE,
  PAGE_SHADOW,
  PAGE_SHADOW_DEPTH,
  SPINE_BOARD,
} from "./book";
import {applyCorruption} from "./corruption";
import {AVG_FACTOR, LINE_STRENGTH, LINE_WIDTH, STRIPE_PITCH} from "./stripe";

// 縞の計算は stripe.ts、本の描き分けは book.ts(どちらも純粋関数)と同じ式を TSL で書いたもの。
// 線ごとのばらつき(位置・太さ・濃さ)は、何本目の縞か(位相の整数部)と、インスタンスごとの seed から決める

const hashNode = (x: Node<"float">) =>
  fract(sin(x.mul(127.1).add(311.7)).mul(43758.5453));

/** 境界を 1px ぶんだけぼかした step(遠くでのギザギザ・ちらつきを避ける)。x が edge を超えると 1 */
const aastep = (edge: Node<"float">, x: Node<"float">) => {
  const w = max(fwidth(x), 1e-5);
  return smoothstep(edge.sub(w), edge.add(w), x);
};

/** 距離 d(m)が 0 の所に引く、太さ width(m)の線の被覆率(0〜1) */
const lineNode = (d: Node<"float">, width: number) =>
  float(1).sub(aastep(float(width / 2), abs(d)));

const stripeFactorNode = (phase: Node<"float">, seed: Node<"float">) => {
  const i = floor(phase);
  const f = phase.sub(i);
  const n = hashNode(i.add(seed));
  const n2 = hashNode(i.add(seed).add(17.3));
  const center = n.sub(0.5).mul(0.3).add(0.5);
  const width = n2.mul(0.8).add(0.6).mul(LINE_WIDTH);
  const d = abs(f.sub(center));
  const line = float(1).sub(smoothstep(width.mul(0.5), width, d));
  const factor = float(1).sub(line.mul(LINE_STRENGTH).mul(n.mul(0.6).add(0.4)));
  // 位相の変化が大きい(縞が 1px 未満)ほど、平均の濃さにぼかして、モアレ・ちらつきを避ける
  const fade = smoothstep(0.35, 0.9, fwidth(phase));
  return mix(factor, float(AVG_FACTOR), fade);
};

/**
 * 束用のマテリアル。板 1 枚を、白い本として描く。地の色は板ごとの色(まとめたジオメトリでは頂点色、
 * InstancedMesh では instanceColor)で、その上に明るさの係数を掛ける。
 * - 上面・下面は表紙(上面には、縁の内側に細い枠線)
 * - 長辺の片方(板ごとに seed で決まる)は背表紙(2 本の背バンド)
 * - 残りの 3 面は、上下が表紙の板の断面、その間がページの小口(細い横縞。表紙のすぐ下は影で少し暗い)
 * 板ごとの大きさと seed は、属性 `sheetInfo`(vec4: 幅, 厚み, 奥行き, seed)から読む。
 * 位置は箱のローカル位置(-0.5〜0.5)に大きさを掛けて、ワールド単位で測る。
 * - merged: 板を 1 つにまとめたジオメトリ用(geometry.ts の buildSheetsGeometry)。箱のローカル位置・法線は、
 *   頂点属性 `bookLocal`・`bookNormal` から読む。uv を持つので、ベイク AO(aoMap)を貼れる
 * - それ以外: InstancedMesh の箱ジオメトリ用。ローカル位置・法線は position・normal そのもので、
 *   sheetInfo は instanced 属性(setSheetInfo で書く)
 * 燃える演出の侵食(corruption.ts)を重ねる。侵食の色に板の色が掛からないよう、まとめたジオメトリの頂点色は
 * vertexColors で掛けず、元の色の側にだけ掛ける(InstancedMesh の色は白い成果物の板だけなので、そのまま掛かってよい)
 */
export const createPaperMaterial = ({
  merged,
}: {
  merged: boolean;
}): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();
  const info = attribute("sheetInfo", "vec4");
  const p = attribute(merged ? "bookLocal" : "position", "vec3");
  const n = attribute(merged ? "bookNormal" : "normal", "vec3");
  const w = info.x;
  const h = info.y;
  const d = info.z;
  const seed = info.w;

  const isFlat = step(0.5, abs(n.y));
  const isTop = step(0.5, n.y);
  const sign = step(0.5, hashNode(seed.add(5.1)))
    .mul(2)
    .sub(1);
  const isSpine = step(0.5, n.z.mul(sign));

  // ページの小口: 上下の表紙の断面と、背の側の背表紙の板の断面を除いた所
  const cover = min(float(COVER_THICKNESS), h.mul(COVER_RATIO_MAX));
  const fromTop = float(0.5).sub(p.y).mul(h);
  const edgeY = float(0.5).sub(abs(p.y)).mul(h);
  const fromSpine = float(0.5).sub(p.z.mul(sign)).mul(d);
  const pages = float(1)
    .sub(isFlat)
    .mul(float(1).sub(isSpine))
    .mul(aastep(cover, edgeY))
    .mul(aastep(float(SPINE_BOARD), fromSpine));
  const shade = mix(
    float(PAGE_SHADOW),
    float(PAGE_SHADE),
    smoothstep(0, PAGE_SHADOW_DEPTH, fromTop.sub(cover)),
  );
  const phase = p.y.add(0.5).mul(h).div(STRIPE_PITCH);
  const pageFactor = stripeFactorNode(phase, seed).mul(shade);

  // 背バンド: 背表紙を横切る 2 本の線(幅の中心から ±BAND_POSITION)
  const band = lineNode(abs(p.x).sub(BAND_POSITION).mul(w), BAND_WIDTH)
    .mul(isSpine)
    .mul(float(1).sub(isFlat));
  // 表紙の枠線: 上面の、縁から FRAME_INSET 内側
  const edge = min(
    float(0.5).sub(abs(p.x)).mul(w),
    float(0.5).sub(abs(p.z)).mul(d),
  );
  const frame = lineNode(edge.sub(FRAME_INSET), FRAME_WIDTH).mul(isTop);
  const coverFactor = float(1)
    .sub(band.mul(BAND_STRENGTH))
    .sub(frame.mul(FRAME_STRENGTH));

  const factor = mix(coverFactor, pageFactor, pages);
  const base = vec3(factor, factor, factor);
  applyCorruption(material, merged ? base.mul(vertexColor().rgb) : base);
  return material;
};

/** 箱ジオメトリに、インスタンスごとの (幅, 厚み, 奥行き, seed) を書く。seed は通し番号から決める */
export const setSheetInfo = (
  geometry: BoxGeometry,
  sizes: readonly Vec3[],
): void => {
  const data = new Float32Array(sizes.length * 4);
  sizes.forEach((size, i) => {
    data.set(size, i * 4);
    data[i * 4 + 3] = sheetSeed(i);
  });
  geometry.setAttribute("sheetInfo", new InstancedBufferAttribute(data, 4));
};

/** 板の通し番号から、縞と背の向きの seed */
export const sheetSeed = (index: number): number => (index * 0.618) % 97;
