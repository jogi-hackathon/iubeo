import {useEffect, useMemo} from "react";
import {BoxGeometry} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {CHAIR_PARTS} from "./chairParts";
import {PROP_COLOR, type Vec3} from "./types";

interface ChairProps {
  position: Vec3;
  yaw?: number;
  visible?: boolean;
  ao?: AOMode;
}

/** 椅子。部品の寸法はジオメトリに焼き込み(scale を使わない)、BVH コライダー込み */
export function Chair({position, yaw = 0, visible = true, ao}: ChairProps) {
  const geometries = useMemo(
    () => CHAIR_PARTS.map((part) => new BoxGeometry(...part.size)),
    [],
  );
  useEffect(
    () => () => {
      for (const g of geometries) {
        g.dispose();
      }
    },
    [geometries],
  );

  return (
    <group position={position} rotation={[0, yaw, 0]} visible={visible}>
      <BVHCollider enabled={visible}>
        {CHAIR_PARTS.map((part, i) => (
          <mesh
            key={i}
            geometry={geometries[i] as BoxGeometry}
            position={part.position}
            userData={aoModeUserData(ao)}
          >
            <meshStandardMaterial color={PROP_COLOR} />
          </mesh>
        ))}
      </BVHCollider>
    </group>
  );
}
