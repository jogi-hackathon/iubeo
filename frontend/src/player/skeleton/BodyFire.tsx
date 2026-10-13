import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Vector3} from "three";
import {float, floor, hash, mix, uniformArray, vec3} from "three/tsl";
import {Sprite} from "three/webgpu";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {registerShaderSwatch} from "../../core/shaderSwatches";
import {createBlockFireMaterial} from "../../objects/directory/fire";
import {BONES} from "./joints";

export const BODY_FIRE_SECONDS = 5;
const IGNITE_SECONDS = 0.3;
const FADE_SECONDS = 1.5;
const PARTICLES = 160;
const SPREAD = 0.14;
const SIZE_MIN = 0.035;
const SIZE_MAX = 0.08;
const RISE_MIN = 0.05;
const RISE_MAX = 0.3;
const GRID = 0.02;

export const bodyFireIgnition = (elapsed: number): number =>
  Math.max(
    0,
    Math.min(
      1,
      elapsed / IGNITE_SECONDS,
      (BODY_FIRE_SECONDS - elapsed) / FADE_SECONDS,
    ),
  );

const createBodyFire = () => {
  const starts = BONES.map(() => new Vector3());
  const ends = BONES.map(() => new Vector3());
  // 名前を付けないと WGSL の変数名がノードの id(NodeBuffer_<id>)になり、マウントのたびに別のシェーダーとしてコンパイルされる
  const startNodes = uniformArray<"vec3">(starts, "vec3").setName(
    "bodyFireStarts",
  );
  const endNodes = uniformArray<"vec3">(ends, "vec3").setName("bodyFireEnds");
  const {material, ignition} = createBlockFireMaterial({
    sizeMin: SIZE_MIN,
    sizeMax: SIZE_MAX,
    grid: GRID,
    position: (seed, t) => {
      const bone = floor(hash(seed.add(1)).mul(BONES.length)).toInt();
      const along = mix(
        startNodes.element(bone),
        endNodes.element(bone),
        hash(seed.add(2)),
      );
      const offset = vec3(
        hash(seed.add(3)),
        hash(seed.add(4)),
        hash(seed.add(6)),
      )
        .sub(0.5)
        .mul(SPREAD);
      const rise = mix(float(RISE_MIN), float(RISE_MAX), hash(seed.add(7))).mul(
        t,
      );
      return along.add(offset).add(vec3(0, rise, 0));
    },
  });
  const sprite = new Sprite(material);
  sprite.count = PARTICLES;
  sprite.frustumCulled = false;
  sprite.raycast = () => {};
  return {sprite, ignition, starts, ends};
};

registerShaderSwatch("bodyFire", () => createBodyFire().sprite);

export function BodyFire({points}: {points: Float32Array}) {
  const {sprite, ignition, starts, ends} = useMemo(createBodyFire, []);
  useEffect(() => () => sprite.material.dispose(), [sprite]);

  const startedAt = useRef<number | null>(null);
  useFrame(({clock}) => {
    startedAt.current ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const level = bodyFireIgnition(elapsed);
    ignition.value = level;
    sprite.visible = level > 0;
    if (level <= 0) {
      return;
    }
    for (const [i, [a, b]] of BONES.entries()) {
      starts[i]?.fromArray(points, a * 3);
      ends[i]?.fromArray(points, b * 3);
    }
  }, FRAME_PRIORITY.skeleton);

  return <primitive object={sprite} />;
}
