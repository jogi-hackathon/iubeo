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

const hashNode = (x: Node<"float">) =>
  fract(sin(x.mul(127.1).add(311.7)).mul(43758.5453));

const aastep = (edge: Node<"float">, x: Node<"float">) => {
  const w = max(fwidth(x), 1e-5);
  return smoothstep(edge.sub(w), edge.add(w), x);
};

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
  const fade = smoothstep(0.35, 0.9, fwidth(phase));
  return mix(factor, float(AVG_FACTOR), fade);
};

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

  const band = lineNode(abs(p.x).sub(BAND_POSITION).mul(w), BAND_WIDTH)
    .mul(isSpine)
    .mul(float(1).sub(isFlat));
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

export const sheetSeed = (index: number): number => (index * 0.618) % 97;
