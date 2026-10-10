import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {PROP_COLOR, type Vec3} from "./types";

interface WallProps {
  position: Vec3;
  size: Vec3;
  color?: string;
  ao?: AOMode;
  /**
   * 見た目を出すか(既定 true)。false にすると、当たり判定だけを置く。
   * 窓の空洞のように「見た目は開けたまま、通れないようにする」ときに使う(ao="realtime" と組で、ベイク対象にもしない)
   */
  visible?: boolean;
}

/** 直方体のブロック(壁・段差など)。BVH コライダー込み */
export function Wall({
  position,
  size,
  color = PROP_COLOR,
  ao,
  visible = true,
}: WallProps) {
  return (
    <BVHCollider>
      <mesh userData={aoModeUserData(ao)} position={position} visible={visible}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
    </BVHCollider>
  );
}
