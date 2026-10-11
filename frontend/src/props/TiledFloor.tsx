import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {useGridFloorMaterial} from "./gridFloorMaterial";

interface TiledFloorProps {
  size?: number;
  thickness?: number;
  tileSize?: number;
  ao?: AOMode;
}

/** 上面が y=0 の平らな床。淡い格子線のタイル付き。BVH コライダー込み */
export function TiledFloor({
  size = 200,
  thickness = 1,
  tileSize = 2,
  ao,
}: TiledFloorProps) {
  const material = useGridFloorMaterial(tileSize);

  return (
    <BVHCollider>
      <mesh
        userData={aoModeUserData(ao)}
        position={[0, -thickness / 2, 0]}
        material={material}
      >
        <boxGeometry args={[size, thickness, size]} />
      </mesh>
    </BVHCollider>
  );
}
