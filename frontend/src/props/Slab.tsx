import {useEffect, useMemo} from "react";
import type {Material} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {buildSlabGeometry} from "./slabGeometry";
import {PROP_COLOR, type Vec3} from "./types";

interface SlabProps {
  polygon: readonly Vec3[];
  offset: Vec3;
  color?: string;
  material?: Material;
  ao?: AOMode;
  blocksCamera?: boolean;
}

export function Slab({
  polygon,
  offset,
  color = PROP_COLOR,
  material,
  ao,
  blocksCamera,
}: SlabProps) {
  const geometry = useMemo(
    () => buildSlabGeometry(polygon, offset),
    [polygon, offset],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <BVHCollider blocksCamera={blocksCamera}>
      <mesh
        geometry={geometry}
        userData={aoModeUserData(ao)}
        {...(material ? {material} : {})}
      >
        {material ? null : <meshStandardMaterial color={color} />}
      </mesh>
    </BVHCollider>
  );
}
