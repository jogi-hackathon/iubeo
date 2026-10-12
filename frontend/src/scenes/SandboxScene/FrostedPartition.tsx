import {useEffect, useMemo} from "react";
import type {MeshBasicNodeMaterial} from "three/webgpu";

import {Slab} from "../../props";
import {
  createFrostedGlassMaterial,
  FROSTED_GLASS_RENDER_ORDER,
} from "./frostedGlass";
import {PARTITION_AXIS, ZONE_PARTITION} from "./layout";

export const useFrostedPartitionMaterial = (): MeshBasicNodeMaterial => {
  const material = useMemo(
    () => createFrostedGlassMaterial(PARTITION_AXIS),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
};

export function FrostedPartition({
  material,
}: {
  material: MeshBasicNodeMaterial;
}) {
  return (
    <Slab
      {...ZONE_PARTITION}
      material={material}
      ao="realtime"
      renderOrder={FROSTED_GLASS_RENDER_ORDER}
    />
  );
}
