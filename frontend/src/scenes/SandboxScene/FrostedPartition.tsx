import {useEffect, useMemo} from "react";
import type {MeshBasicNodeMaterial} from "three/webgpu";

import {Slab} from "../../props";
import {createFrostedGlassMaterial} from "./frostedGlass";
import {PARTITION_AXIS, ZONE_PARTITION} from "./layout";

/**
 * 仕切り用のすりガラスのマテリアル。シーンのマウントで 1 つ作り、全区画の仕切りで共有する
 * (ビューポートのコピーがマテリアルごとに走るので、1 つにして 1 回で済ませる)。アンマウントで dispose する
 */
export const useFrostedPartitionMaterial = (): MeshBasicNodeMaterial => {
  const material = useMemo(
    () => createFrostedGlassMaterial(PARTITION_AXIS),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
};

/**
 * 区画の仕切り(すりガラスの板)。当たり判定は Slab の BVHCollider のまま(プレイヤーは自分の区画から出られない)。
 * 透明で、ベイク AO の対象外(realtime = 遮蔽物にもならない)。GTAO はマテリアル側で外す
 */
export function FrostedPartition({
  material,
}: {
  material: MeshBasicNodeMaterial;
}) {
  return <Slab {...ZONE_PARTITION} material={material} ao="realtime" />;
}
