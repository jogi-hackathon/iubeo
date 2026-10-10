import {useEffect, useRef, useState} from "react";
import type {MeshBasicNodeMaterial} from "three/webgpu";

import {ServerAuthority} from "../../authority/server/ServerAuthority";
import {gameFlow} from "../../flow/store";
import {ManagedObjects} from "../../objects";
import {RemotePlayers} from "../../player";
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
  sandboxSpawnOf,
  seatYaw,
} from "./layout";

const ZONES = Array.from({length: ZONE_COUNT}, (_, i) => i);

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
 * サーバーが置くオブジェクトは、ベイク時と数・位置が違うとシーン全体のベイク AO が外れるので、
 * room と同じく AO は realtime にしてベイクしない(床・外壁・屋根・イスだけをベイクする。透明な仕切りもベイクしない=遮蔽物にもしない)。
 *
 * オーソリティ: ゲームの流れ(flow/)がセッションに入れたときは、ServerAuthority がサーバーのセッションにつなぎ、
 * 物(ManagedObjects)と他のプレイヤー(RemotePlayers)を出す。準備完了は、最初の snapshot を受け取って自分を置いた後(authority)。
 * セッションが無いとき(デバッグパネルでの直接移動・AO のベイク)は、建物だけを出し、マウントで準備完了にする(mount)
 */
export function SandboxScene() {
  const [session] = useState(() => gameFlow.currentSession());
  useLeaveSessionOnUnmount();
  return (
    <>
      <SandboxStructure />
      {session && (
        <>
          <ServerAuthority
            scene="sandbox"
            sessionId={session.sessionId}
            playerId={session.playerId}
            spawnOf={sandboxSpawnOf}
            onReady={gameFlow.sessionReady}
            onClosed={gameFlow.sessionClosed}
          />
          <ManagedObjects layout={SANDBOX_LAYOUT} ao="realtime" />
          <RemotePlayers />
        </>
      )}
    </>
  );
}

/**
 * シーンを離れたら、ゲームの流れに知らせる(leftSession)。
 * StrictMode の開発時は、マウント直後に effect の後始末がいったん走って、また設定が走る。
 * その間に知らせると流れが idle に戻ってしまうので、後始末では 1 tick 待って、設定が走り直したら取り消す
 */
const useLeaveSessionOnUnmount = () => {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    return () => {
      pending.current = setTimeout(() => {
        pending.current = null;
        gameFlow.leftSession();
      }, 0);
    };
  }, []);
};

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
