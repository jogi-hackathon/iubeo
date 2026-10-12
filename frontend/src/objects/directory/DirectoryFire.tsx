import {createPortal, useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Sprite} from "three/webgpu";

import {bakedAOErase} from "../../bake/aoErase";
import {registerShaderSwatch} from "../../core/shaderSwatches";
import type {Vec3} from "../../props/types";
import {CORRUPT_SECONDS, directoryCorruption} from "./corruption";
import {createFireMaterial, fireParamsFor, IGNITE_SECONDS} from "./fire";
import {mountainReach, type MountainSizeName} from "./mountain";

registerShaderSwatch("directoryFire", () => {
  const params = fireParamsFor("small");
  const sprite = new Sprite(createFireMaterial(params).material);
  sprite.count = params.count;
  return sprite;
});

const AO_ERASE_REACH = 1.3;
const FIRE_FADE_RATIO = 0.25;

export function DirectoryFire({
  position,
  size,
}: {
  position: Vec3;
  size: MountainSizeName;
}) {
  const scene = useThree((s) => s.scene);
  const {sprite, ignition} = useMemo(() => {
    const params = fireParamsFor(size);
    const {material, ignition} = createFireMaterial(params);
    const sprite = new Sprite(material);
    sprite.count = params.count;
    sprite.frustumCulled = false;
    sprite.raycast = () => {};
    return {sprite, ignition};
  }, [size]);
  useEffect(
    () => () => {
      sprite.material.dispose();
    },
    [sprite],
  );

  useEffect(() => {
    bakedAOErase.center.value.set(position[0], position[2]);
    bakedAOErase.radius.value = mountainReach(size) * AO_ERASE_REACH;
    return () => {
      directoryCorruption.progress.value = 0;
      bakedAOErase.amount.value = 0;
    };
  }, [position, size]);

  const startedAt = useRef<number | null>(null);
  useFrame(({clock}) => {
    startedAt.current ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const progress = Math.min(1, elapsed / CORRUPT_SECONDS);
    directoryCorruption.progress.value = progress;
    bakedAOErase.amount.value = progress;
    ignition.value = Math.min(
      1,
      elapsed / IGNITE_SECONDS,
      (1 - progress) / FIRE_FADE_RATIO,
    );
  });

  return createPortal(
    <group position={position}>
      <primitive object={sprite} />
    </group>,
    scene,
  );
}
