import type {Material} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {PROP_COLOR, type Vec3} from "./types";

interface WallProps {
  position: Vec3;
  size: Vec3;
  color?: string;
  material?: Material;
  ao?: AOMode;
  visible?: boolean;
}

export function Wall({
  position,
  size,
  color = PROP_COLOR,
  material,
  ao,
  visible = true,
}: WallProps) {
  return (
    <BVHCollider>
      <mesh
        userData={aoModeUserData(ao)}
        position={position}
        visible={visible}
        {...(material ? {material} : {})}
      >
        <boxGeometry args={size} />
        {material ? null : <meshStandardMaterial color={color} />}
      </mesh>
    </BVHCollider>
  );
}
