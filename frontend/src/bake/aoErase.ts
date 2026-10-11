import {Vector2} from "three";
import {
  distance,
  float,
  materialAO,
  mix,
  positionWorld,
  smoothstep,
  uniform,
} from "three/tsl";
import type {Node} from "three/webgpu";

export const bakedAOErase = {
  center: uniform(new Vector2()),
  radius: uniform(1),
  amount: uniform(0),
};

const EDGE_RATIO = 0.2;

export const erasableBakedAO = (): Node<"float"> => {
  const {center, radius, amount} = bakedAOErase;
  const d = distance(positionWorld.xz, center);
  const inside = float(1).sub(
    smoothstep(radius.mul(1 - EDGE_RATIO), radius, d),
  );
  return mix(materialAO, float(1), inside.mul(amount));
};
