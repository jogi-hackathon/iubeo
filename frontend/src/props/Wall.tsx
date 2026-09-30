import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {PROP_COLOR, type Vec3} from "./types";

interface WallProps {
  position: Vec3;
  size: Vec3;
  color?: string;
  /** AO の出し方(src/bake/aoMode.ts)。省略時は親の指定(無ければ baked) */
  ao?: AOMode;
}

/** 直方体のブロック(壁・段差など)。BVH コライダー込み */
export function Wall({position, size, color = PROP_COLOR, ao}: WallProps) {
  return (
    <BVHCollider>
      <mesh userData={aoModeUserData(ao)} position={position}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </BVHCollider>
  );
}
