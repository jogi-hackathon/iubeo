import {BVHCollider} from "../core/bvh";
import {PROP_COLOR, type Vec3} from "./types";

interface BallProps {
  position: Vec3;
  radius: number;
  color?: string;
}

/** 球。BVH コライダー込み */
export function Ball({position, radius, color = PROP_COLOR}: BallProps) {
  return (
    <BVHCollider>
      <mesh position={position} castShadow receiveShadow>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </BVHCollider>
  );
}
