import {createPortal, useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Vector3} from "three";
import {
  float,
  floor,
  hash,
  instanceIndex,
  mix,
  pow,
  select,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import {Sprite, SpriteNodeMaterial} from "three/webgpu";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {registerShaderSwatch} from "../../core/shaderSwatches";
import {
  blockFireColor,
  snapFloat,
  snapVec3,
} from "../../objects/directory/fire";
import {GRAVITY} from "../constants";
import {J} from "./joints";
import {at} from "./pose";
import type {Ragdoll} from "./ragdoll";

export const SPLASH_LIFE_MAX = 0.9;
const SPLASH_LIFE_MIN = 0.35;
const PARTICLES = 160;
const SPEED_MIN = 2.5;
const SPEED_MAX = 7;
const CONE = 0.8;
const SIZE_MIN = 0.03;
const SIZE_MAX = 0.09;
const GRID = 0.02;
const STEP_FPS = 24;
const TOE_ABOVE_FLOOR = 0.03;

const createSplash = () => {
  const origin = uniform(new Vector3());
  const direction = uniform(new Vector3(0, 0, 1));
  const elapsed = uniform(-1);
  const floorY = uniform(0);

  const id = instanceIndex.toFloat();
  const tau = floor(elapsed.mul(STEP_FPS)).div(STEP_FPS);
  const life = mix(
    float(SPLASH_LIFE_MIN),
    float(SPLASH_LIFE_MAX),
    hash(id.add(1)),
  );
  const u = tau.div(life);
  const jitter = vec3(hash(id.add(2)), hash(id.add(3)), hash(id.add(4)))
    .sub(0.5)
    .mul(2 * CONE);
  const velocity = direction
    .add(jitter)
    .normalize()
    .mul(mix(float(SPEED_MIN), float(SPEED_MAX), hash(id.add(5))));
  const flight = origin
    .add(velocity.mul(tau))
    .sub(vec3(0, tau.mul(tau).mul(GRAVITY / 2), 0));
  const position = vec3(flight.x, flight.y.max(floorY), flight.z);

  const material = new SpriteNodeMaterial();
  material.positionNode = snapVec3(position, GRID);
  const alive = select(
    tau.greaterThanEqual(0).and(u.lessThan(1)),
    float(1),
    float(0),
  );
  const size = snapFloat(
    mix(float(SIZE_MIN), float(SIZE_MAX), hash(id.add(6))).mul(
      pow(u.oneMinus().max(0), float(0.8)),
    ),
    GRID,
  ).mul(alive);
  material.scaleNode = vec2(size, size);
  material.colorNode = blockFireColor(u);

  const sprite = new Sprite(material);
  sprite.count = PARTICLES;
  sprite.frustumCulled = false;
  sprite.raycast = () => {};
  return {sprite, origin, direction, elapsed, floorY};
};

// 死ぬまでマウントされないので、見本をウォームアップに描かせる。elapsed が負のままなので粒の大きさは 0
registerShaderSwatch("headSplash", () => createSplash().sprite);

export const floorBelow = (body: Ragdoll): number =>
  Math.min(at(body.pos, J.lToe * 3 + 1), at(body.pos, J.rToe * 3 + 1)) -
  TOE_ABOVE_FLOOR;

export const writeSplashSource = (
  body: Ragdoll,
  origin: Vector3,
  direction: Vector3,
): void => {
  const i = J.head * 3;
  origin.fromArray(body.pos, i);
  direction.fromArray(body.prev, i).sub(origin).negate();
  if (direction.lengthSq() < 1e-12) {
    direction.set(0, 1, 0);
  }
  direction.normalize();
};

export function HeadSplash({body}: {body: Ragdoll}) {
  const scene = useThree((s) => s.scene);
  const {sprite, origin, direction, elapsed, floorY} = useMemo(
    createSplash,
    [],
  );
  useEffect(() => () => sprite.material.dispose(), [sprite]);

  const startedAt = useRef<number | null>(null);
  useFrame(({clock}) => {
    if (startedAt.current === null) {
      if (!body.active) {
        sprite.visible = false;
        return;
      }
      startedAt.current = clock.elapsedTime;
      writeSplashSource(body, origin.value, direction.value);
      floorY.value = floorBelow(body);
    }
    const t = clock.elapsedTime - startedAt.current;
    elapsed.value = t;
    sprite.visible = t <= SPLASH_LIFE_MAX;
  }, FRAME_PRIORITY.skeleton);

  return createPortal(<primitive object={sprite} />, scene);
}
