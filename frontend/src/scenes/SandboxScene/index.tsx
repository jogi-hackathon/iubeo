import type {MeshBasicNodeMaterial} from "three/webgpu";

import {ManagedObjects} from "../../objects";
import {Chair, Slab, Wall} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";
import {
  FrostedPartition,
  useFrostedPartitionMaterial,
} from "./FrostedPartition";
import {
  ZONE_CHAIR,
  SANDBOX_LAYOUT,
  ZONE_COUNT,
  ZONE_FLOOR,
  ZONE_ROOF,
  ZONE_WALLS,
  seatYaw,
} from "./layout";

const ZONES = Array.from({length: ZONE_COUNT}, (_, i) => i);

/**
 * 1 人分の区画の部品(区画ローカルの値を、区画ごとに Y 軸まわりへ回した 1 つの group に入れる。
 * 将来、区画ごと落とす演出ができるよう、区画の部品はこの group にまとめる)。
 * partitionMaterial は、仕切り(すりガラス)のマテリアル。全区画で共有する
 */
function SandboxZone({
  index,
  partitionMaterial,
}: {
  index: number;
  partitionMaterial: MeshBasicNodeMaterial;
}) {
  return (
    <group rotation={[0, seatYaw(index + 1), 0]}>
      <Slab {...ZONE_FLOOR} />
      {ZONE_WALLS.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} />
      ))}
      <FrostedPartition material={partitionMaterial} />
      <Slab {...ZONE_ROOF} />
      <Chair position={ZONE_CHAIR.position} yaw={ZONE_CHAIR.yaw} />
    </group>
  );
}

/**
 * 正三角柱 + 三角錐の屋根の 3 人用部屋(セッション開始時に入室)。置き場所・寸法は ./layout。
 * 中心から 3 つの頂点へ引いた仕切りで、床を 3 つの三角形の区画に分ける。区画 k は、区画ローカル座標を Y 軸まわりに k * 120° 回したもの。
 * 区画ごとに、床・外壁(窓の空洞つき)・左の仕切り・屋根・イスを置く(共通の床は使わず、区画ごとの床を敷く)。
 * 仕切りは中心から頂点まで届き、上端は屋根の稜線に沿う(ディレクトリの山は貫く)。壁より薄いすりガラスの板(型板ガラス風。FrostedPartition)で、
 * 背後は透けて見えるが、輪郭が歪む(格子の線も入れられるが、今は消している)。当たり判定はあるので、プレイヤーは自分の区画から出られない。
 * すりガラスのマテリアルは、このシーンのマウントで 1 つ作って 3 区画の仕切りで共有する。
 * ディレクトリ(中心の large の山。3 区画で共有)・ワークスペース・キャンバス・PC は ManagedObjects が描く。
 * サンドボックスは出し入れするプロップがないので、トグルのストアは持たない。
 * サーバーが置くオブジェクトは、本番ではサーバーの配置(dev のダミーと同じとは限らない)で決まり、ベイク時と数・位置が違うとシーン全体のベイク AO が外れるので、
 * room と同じく AO は realtime にしてベイクしない(床・外壁・屋根・イスだけをベイクする。透明な仕切りもベイクしない=遮蔽物にもしない)
 */
// TODO(E): サンドボックスのオーソリティ(LocalAuthority などで置く物と、初期設定)は未対応。今は物を置かないので、準備は mount で足りる
export function SandboxScene() {
  return (
    <>
      <SandboxStructure />
      <ManagedObjects layout={SANDBOX_LAYOUT} ao="realtime" />
    </>
  );
}

/**
 * サンドボックスの建物(環境・3 区画の床・外壁・仕切り・屋根・イス)。サーバーが置くオブジェクトは含まない
 */
export function SandboxStructure() {
  const partitionMaterial = useFrostedPartitionMaterial();
  return (
    <>
      <WhiteWorld />
      {ZONES.map((zone) => (
        <SandboxZone
          key={zone}
          index={zone}
          partitionMaterial={partitionMaterial}
        />
      ))}
    </>
  );
}
