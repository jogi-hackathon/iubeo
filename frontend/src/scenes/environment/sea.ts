import {Matrix4, Vector2, Vector3, type Camera} from "three";
import {
  Break,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  hash,
  If,
  ivec2,
  Loop,
  max,
  min,
  mix,
  mod,
  pow,
  screenCoordinate,
  select,
  sin,
  smoothstep,
  textureLoad,
  time,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  type Node,
  type WebGPURenderer,
} from "three/webgpu";

import type {PostProcessSettings} from "../../camera/postprocess/settings";

const SEA_LIGHT = vec3(-0.55, 0.42, -0.72).normalize();
const GRAVITY = 9.8;

type Wave = {angle: number; wavelength: number; weight: number};

const WAVES: readonly Wave[] = [
  {angle: 0.3, wavelength: 42, weight: 0.45},
  {angle: 0.9, wavelength: 27, weight: 0.28},
  {angle: -0.4, wavelength: 16, weight: 0.17},
  {angle: 1.6, wavelength: 9, weight: 0.1},
];

const MARCH_STEPS = 24;
const MAX_DISTANCE = 1800;
const FADE_START = 60;
const FADE_END = 1400;

const AWAY_FOR_FULL_INK = 0.12;
const INK_MAX = 0.45;
const DIGIT_FLIP_RATE = 1.5;
const GLYPH_ZERO = 0x69bd96;
const GLYPH_ONE = 0x262227;

export interface Sea {
  colorAt(px: Node<"vec2">): Node<"vec3">;
  update(renderer: WebGPURenderer, camera: Camera): void;
  apply(settings: PostProcessSettings): void;
}

const waveTerms = (
  p: Node<"vec2">,
  scale: Node<"float">,
  speed: Node<"float">,
) =>
  WAVES.map((w) => {
    const k = (2 * Math.PI) / w.wavelength;
    const dir = vec2(Math.cos(w.angle), Math.sin(w.angle));
    const phase = dot(p, dir)
      .div(scale)
      .sub(time.mul(Math.sqrt(GRAVITY / k)).mul(speed))
      .mul(k);
    const s = sin(phase).add(1).mul(0.5);
    return {w, k, dir, phase, s};
  });

const glyphBit = (uv: Node<"vec2">, bits: Node<"float">): Node<"float"> => {
  const gx = floor(uv.x.mul(8)).sub(2);
  const gy = floor(uv.y.mul(8)).sub(1);
  const inside = gx
    .greaterThanEqual(0)
    .and(gx.lessThan(4))
    .and(gy.greaterThanEqual(0))
    .and(gy.lessThan(6));
  const index = float(5).sub(gy).mul(4).add(float(3).sub(gx));
  const bit = mod(floor(bits.div(pow(2, index))), 2);
  return select(inside, bit, float(0));
};

export const createSea = (): Sea => {
  const u = {
    enabled: uniform(1),
    crest: uniform(0),
    amplitude: uniform(3.5),
    wavelengthScale: uniform(1),
    speed: uniform(1),
    cellSize: uniform(8),
    screenSize: uniform(new Vector2(1, 1)),
    projectionInverse: uniform(new Matrix4()),
    cameraWorld: uniform(new Matrix4()),
    cameraPosition: uniform(new Vector3()),
  };
  const mean = u.crest.sub(u.amplitude);

  const heightAt = (p: Node<"vec2">): Node<"float"> =>
    waveTerms(p, u.wavelengthScale, u.speed)
      .reduce<Node<"float">>(
        (h, {w, s}) => h.add(s.mul(s).mul(2).sub(1).mul(w.weight)),
        float(0),
      )
      .mul(u.amplitude)
      .add(mean);

  const slopeAt = (p: Node<"vec2">): Node<"vec2"> =>
    waveTerms(p, u.wavelengthScale, u.speed)
      .reduce<Node<"vec2">>(
        (g, {w, k, dir, phase, s}) =>
          g.add(dir.mul(s.mul(cos(phase)).mul(2 * k * w.weight))),
        vec2(0),
      )
      .mul(u.amplitude)
      .div(u.wavelengthScale);

  const rayThrough = (px: Node<"vec2">): Node<"vec3"> => {
    const ndc = px.div(u.screenSize).mul(2).sub(1).mul(vec2(1, -1));
    const view = u.projectionInverse.mul(vec4(ndc, 1, 1));
    return u.cameraWorld.mul(vec4(view.xyz.div(view.w), 0)).xyz.normalize();
  };

  const inkField = Fn(() => {
    const result = float(0).toVar();
    const dir = rayThrough(screenCoordinate.xy.mul(u.cellSize));
    If(dir.y.lessThan(0), () => {
      const ro = u.cameraPosition;
      const down = dir.y.negate();
      const tStart = max(ro.y.sub(u.crest).div(down), 0);
      const tEnd = min(ro.y.sub(mean.sub(u.amplitude)).div(down), MAX_DISTANCE);
      const hitT = float(MAX_DISTANCE).toVar();
      const prevT = tStart.toVar();
      const prevGap = float(1).toVar();
      If(tStart.lessThan(tEnd), () => {
        Loop(MARCH_STEPS, ({i}) => {
          const s = float(i).add(1).div(MARCH_STEPS);
          const t = mix(tStart, tEnd, s.mul(s));
          const p = ro.add(dir.mul(t));
          const gap = p.y.sub(heightAt(p.xz));
          If(gap.lessThan(0), () => {
            hitT.assign(mix(prevT, t, prevGap.div(prevGap.sub(gap))));
            Break();
          });
          prevT.assign(t);
          prevGap.assign(gap);
        });
      });
      const slope = slopeAt(ro.add(dir.mul(hitT)).xz);
      const normal = vec3(slope.x.negate(), 1, slope.y.negate()).normalize();
      const away = SEA_LIGHT.y.sub(dot(normal, SEA_LIGHT));
      result.assign(
        smoothstep(0, AWAY_FOR_FULL_INK, away).mul(
          smoothstep(FADE_START, FADE_END, hitT).oneMinus(),
        ),
      );
    });
    return vec4(result, 0, 0, 1);
  });

  const field = new RenderTarget(1, 1, {depthBuffer: false});
  const fieldMaterial = new NodeMaterial();
  fieldMaterial.fragmentNode = inkField();
  const quad = new QuadMesh(fieldMaterial);
  const drawingSize = new Vector2();
  let cellCssSize = 8;
  let alignToPixelate = (cell: number) => cell;

  const colorAt = (px: Node<"vec2">): Node<"vec3"> => {
    const cell = floor(px.div(u.cellSize));
    const amount = textureLoad(field.texture, ivec2(cell)).r;
    const flip = floor(time.mul(DIGIT_FLIP_RATE));
    const seed = cell.x
      .toUint()
      .add(cell.y.toUint().mul(uint(4099)))
      .add(flip.toUint().mul(uint(65537)));
    const bits = select(
      hash(seed).lessThan(0.5),
      float(GLYPH_ZERO),
      float(GLYPH_ONE),
    );
    const ink = amount
      .mul(INK_MAX)
      .mul(glyphBit(fract(px.div(u.cellSize)), bits))
      .mul(u.enabled);
    return vec3(ink.oneMinus());
  };

  return {
    colorAt,
    update(renderer, camera) {
      if (u.enabled.value === 0) {
        return;
      }
      renderer.getDrawingBufferSize(drawingSize);
      const cell = Math.max(
        Math.round(cellCssSize * renderer.getPixelRatio()),
        4,
      );
      u.cellSize.value = alignToPixelate(cell);
      const width = Math.ceil(drawingSize.x / cell);
      const height = Math.ceil(drawingSize.y / cell);
      if (field.width !== width || field.height !== height) {
        field.setSize(width, height);
      }
      u.screenSize.value.copy(drawingSize);
      u.projectionInverse.value.copy(camera.projectionMatrixInverse);
      u.cameraWorld.value.copy(camera.matrixWorld);
      u.cameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(field);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
    },
    apply(s) {
      const sea = s.sea;
      u.enabled.value = sea.enabled ? 1 : 0;
      u.crest.value = sea.crest;
      u.amplitude.value = sea.amplitude;
      u.wavelengthScale.value = sea.wavelengthScale;
      u.speed.value = sea.speed;
      cellCssSize = sea.cellSize;
      alignToPixelate = (cell) =>
        s.enabled && s.pixelate.enabled
          ? Math.ceil(cell / s.pixelate.pixelSize) * s.pixelate.pixelSize
          : cell;
    },
  };
};
