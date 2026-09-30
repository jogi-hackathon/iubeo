import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {PROP_COLOR, type Vec3} from "./types";

interface BallProps {
  position: Vec3;
  radius: number;
  color?: string;
  /** AO の出し方(src/bake/aoMode.ts)。省略時は親の指定(無ければ baked) */
  ao?: AOMode;
}

/** 球。BVH コライダー込み */
export function Ball({position, radius, color = PROP_COLOR, ao}: BallProps) {
  return (
    <BVHCollider>
      <mesh userData={aoModeUserData(ao)} position={position}>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </BVHCollider>
  );
}
