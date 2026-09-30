import {
  abs,
  attribute,
  float,
  floor,
  fract,
  fwidth,
  mix,
  sin,
  smoothstep,
  step,
  vec4,
} from "three/tsl";
import {
  type BoxGeometry,
  InstancedBufferAttribute,
  MeshStandardNodeMaterial,
  type Node,
} from "three/webgpu";

import {AVG_FACTOR, LINE_STRENGTH, LINE_WIDTH, STRIPE_PITCH} from "./stripe";

// 縞の計算は stripe.ts(純粋関数)と同じ式を TSL で書いたもの。線ごとのばらつき(位置・太さ・濃さ)は、
// 何本目の縞か(位相の整数部)と、インスタンスごとの seed から決める

const hashNode = (x: Node<"float">) =>
  fract(sin(x.mul(127.1).add(311.7)).mul(43758.5453));

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
 * 束用のマテリアル。地の色はインスタンスの色(instanceColor)で、その上に側面の縞の係数を掛ける。
 * インスタンスごとの高さと縞の seed は、ジオメトリの instanced 属性 `sheetInfo`(vec2)から読む
 * (setSheetInfo で書く)。箱ジオメトリの位置(-0.5〜0.5)から底からの高さの比率を出し、
 * 法線が横向き(側面)の面だけに縞を掛ける
 */
export const createPaperMaterial = (): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();
  const info = attribute("sheetInfo", "vec2");
  const y01 = attribute("position", "vec3").y.add(0.5);
  const side = float(1).sub(step(0.5, abs(attribute("normal", "vec3").y)));
  const phase = y01.mul(info.x).div(STRIPE_PITCH);
  const factor = mix(float(1), stripeFactorNode(phase, info.y), side);
  material.colorNode = vec4(factor, factor, factor, 1);
  return material;
};

/** 箱ジオメトリに、インスタンスごとの (高さ, 縞の seed) を書く。高さは板の厚み(size の y)。seed は通し番号から決める */
export const setSheetInfo = (
  geometry: BoxGeometry,
  heights: readonly number[],
): void => {
  const data = new Float32Array(heights.length * 2);
  heights.forEach((h, i) => {
    data[i * 2] = h;
    data[i * 2 + 1] = (i * 0.618) % 97;
  });
  geometry.setAttribute("sheetInfo", new InstancedBufferAttribute(data, 2));
};
