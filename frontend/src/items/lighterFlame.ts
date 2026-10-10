import {
  abs,
  color,
  float,
  Fn,
  mix,
  normalGeometry,
  normalView,
  positionGeometry,
  sin,
  smoothstep,
  time,
  vec3,
} from "three/tsl";
import {
  BackSide,
  LatheGeometry,
  MeshBasicNodeMaterial,
  type Node,
  Vector2,
} from "three/webgpu";

import {setSkipGTAO} from "../camera/postprocess/skipGTAO";
import {
  LIGHTER_FLAME_CORE,
  LIGHTER_FLAME_PROFILE,
  LIGHTER_FLAME_SIZE,
  LIGHTER_HELD_OUTLINE,
} from "./lighter";

const SEGMENTS = 12;
const PROFILE_STEPS = 16;

const rawRadius = (h: number): number => {
  const {baseRadius, widestAt, tipPower} = LIGHTER_FLAME_PROFILE;
  const k = Math.log(0.5) / Math.log(widestAt);
  const swell = Math.sin(Math.PI * h ** k);
  return (1 - h) ** tipPower * (baseRadius + (1 - baseRadius) * swell);
};

const flameGeometry = (): LatheGeometry => {
  const radii = Array.from({length: PROFILE_STEPS + 1}, (_, i) =>
    rawRadius(i / PROFILE_STEPS),
  );
  const widest = Math.max(...radii);
  const points = radii.map(
    (r, i) => new Vector2(Math.max(r / widest, 0.008) * 0.5, i / PROFILE_STEPS),
  );
  return new LatheGeometry(points, SEGMENTS);
};

export const FLAME_GEOMETRY = flameGeometry();

const height = positionGeometry.y;

const swayedPosition: Node<"vec3"> = Fn(() => {
  const w = height.mul(height);
  const t = time;
  const x = sin(t.mul(7.3).add(height.mul(4)))
    .mul(0.1)
    .add(sin(t.mul(11.7).add(height.mul(2)).add(1.3)).mul(0.05))
    .mul(w);
  const z = sin(t.mul(9.1).add(height.mul(3)).add(2))
    .mul(0.07)
    .mul(w);
  const y = height.mul(
    sin(t.mul(8.9))
      .mul(0.06)
      .add(sin(t.mul(13.3).add(0.7)).mul(0.04)),
  );
  return positionGeometry.add(vec3(x, y, z));
})();

const FLAME_RED = color("#9e4e42");
const TONGUE = color("#c77f6d");
const OUTLINE = color("#47221c");
const FLAME_OUTLINE = LIGHTER_HELD_OUTLINE * 0.6;

const facing = abs(normalView.z);

const tongueMask: Node<"float"> = Fn(() => {
  const {width, height: tongueHeight} = LIGHTER_FLAME_CORE;
  const edge = Math.sqrt(1 - width * width);
  const inside = smoothstep(edge - 0.02, edge + 0.02, facing);
  const below = float(1).sub(
    smoothstep(tongueHeight - 0.03, tongueHeight, height),
  );
  return inside.mul(below).mul(smoothstep(0.06, 0.09, height));
})();

const flameMaterial = new MeshBasicNodeMaterial();
flameMaterial.positionNode = swayedPosition;
flameMaterial.colorNode = mix(FLAME_RED, TONGUE, tongueMask);
setSkipGTAO(flameMaterial, true);

const outlineMaterial = new MeshBasicNodeMaterial({side: BackSide});
outlineMaterial.positionNode = swayedPosition.add(
  normalGeometry.mul(
    vec3(
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[0],
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[1],
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[2],
    ),
  ),
);
outlineMaterial.colorNode = OUTLINE;
setSkipGTAO(outlineMaterial, true);

export const FLAME_MATERIAL = flameMaterial;
export const FLAME_OUTLINE_MATERIAL = outlineMaterial;
