import {Box3, Vector3} from "three";

import type {Collider} from "../core/bvh";
import {prepareSphereTargets, resolveSphere} from "../player/physics";

export const FLY_CAMERA_RADIUS = 0.3;
const MAX_STEP = FLY_CAMERA_RADIUS / 2;
const PUSH_ITERATIONS = 2;

const step = new Vector3();
const pushOut = new Vector3();
const end = new Vector3();
const sweep = new Box3();

export const cameraBlockers = (
  colliders: readonly Collider[],
): readonly Collider[] => colliders.filter((c) => c.blocksCamera);

export const moveFlyCamera = (
  position: Vector3,
  move: Vector3,
  blockers: readonly Collider[],
): Vector3 => {
  sweep
    .setFromPoints([position, end.addVectors(position, move)])
    .expandByScalar(FLY_CAMERA_RADIUS * 2);
  const targets = prepareSphereTargets(blockers, sweep);
  const steps = Math.max(1, Math.ceil(move.length() / MAX_STEP));
  step.copy(move).divideScalar(steps);
  for (let i = 0; i < steps; i++) {
    position.add(step);
    for (let iter = 0; iter < PUSH_ITERATIONS; iter++) {
      resolveSphere(position, FLY_CAMERA_RADIUS, targets, pushOut);
      if (pushOut.lengthSq() < 1e-12) {
        break;
      }
      position.add(pushOut);
    }
  }
  return position;
};
