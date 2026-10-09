import {useEffect, useMemo} from "react";
import type {Material} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {BVHCollider} from "../core/bvh";
import {buildSlabGeometry} from "./slabGeometry";
import {PROP_COLOR, type Vec3} from "./types";

interface SlabProps {
  /** 多角形の頂点(同一平面の凸。位置は親の座標系)。参照が変わるとジオメトリを作り直すので、定数を渡すこと */
  polygon: readonly Vec3[];
  /** 多角形を押し出すベクトル(多角形の面と平行でないこと) */
  offset: Vec3;
  /** 白い板の色。material を渡したときは使わない */
  color?: string;
  /** 差し替えるマテリアル(省略時は color の白い板)。所有は呼び出し側で、Slab は dispose しない(複数の Slab で共有できる) */
  material?: Material;
  /** AO の出し方(src/bake/aoMode.ts)。省略時は親の指定(無ければ baked) */
  ao?: AOMode;
}

/** 凸多角形を押し出した板(床・斜めの壁・屋根など。箱は Wall)。BVH コライダー込み */
export function Slab({
  polygon,
  offset,
  color = PROP_COLOR,
  material,
  ao,
}: SlabProps) {
  const geometry = useMemo(
    () => buildSlabGeometry(polygon, offset),
    [polygon, offset],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <BVHCollider>
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
