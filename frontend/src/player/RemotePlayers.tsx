import {useFrame} from "@react-three/fiber";
import {useMemo, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {HeldItem} from "../items";
import {playerManager} from "./playerStore";
import {PlayerSkeleton} from "./skeleton";
import {createPlayerState} from "./state";
import type {PlayerStatus} from "./types";
import {usePlayersState} from "./usePlayers";

/** CPU がその場でうろうろする円の半径(m)。区画の中で収まる大きさ */
const CPU_WANDER_RADIUS = 0.9;
/** CPU が円を 1 周する時間(秒) */
const CPU_WANDER_SECONDS = 7;

/**
 * CPU の見た目のために、スポーンの周りを円を描いて歩かせる。
 * 位置はサーバーが持たない(サーバーは CPU の transform を配らない)ので、見た目だけクライアントで作る。
 * 遊びには影響しない(判定は位置を使わない)
 */
function wanderCpu(
  state: ReturnType<typeof createPlayerState>,
  t: number,
  phase: number,
): void {
  const omega = (Math.PI * 2) / CPU_WANDER_SECONDS;
  const w = (t / CPU_WANDER_SECONDS) * Math.PI * 2 + phase;
  state.position.x += Math.cos(w) * CPU_WANDER_RADIUS;
  state.position.z += Math.sin(w) * CPU_WANDER_RADIUS;
  // 円の接線方向。velocity を入れると、歩くアニメーションになる
  state.velocity.set(
    -Math.sin(w) * CPU_WANDER_RADIUS * omega,
    0,
    Math.cos(w) * CPU_WANDER_RADIUS * omega,
  );
  state.yaw = Math.atan2(-state.velocity.x, -state.velocity.z);
  state.onGround = true;
}

/** プレイヤー id から、CPU ごとに違う開始角を作る(全員が同じ向きに動かないように) */
const wanderPhase = (playerId: string): number => {
  let h = 0;
  for (const c of playerId) {
    h = (h * 31 + c.charCodeAt(0)) % 1000;
  }
  return (h / 1000) * Math.PI * 2;
};

function RemotePlayer({player}: {player: PlayerStatus}) {
  const state = useMemo(() => createPlayerState(0, 0, 0), []);
  const {playerId, heldItem, kind} = player;
  const [placed, setPlaced] = useState(false);
  const phase = useMemo(() => wanderPhase(playerId), [playerId]);

  useFrame(({clock}) => {
    const ok = playerManager.sample(playerId, performance.now(), state);
    if (ok && kind === "cpu") {
      wanderCpu(state, clock.elapsedTime, phase);
    }
    if (ok !== placed) {
      setPlaced(ok);
    }
  }, FRAME_PRIORITY.player);

  return (
    <PlayerSkeleton
      state={state}
      visible={placed}
      holding={heldItem !== null}
      handItem={heldItem && <HeldItem item={heldItem} />}
    />
  );
}

/**
 * 自分以外のプレイヤーの身体。位置と向きは playerManager が補間した物を毎フレーム読む。
 * 切断中のプレイヤーは描かない(再接続すれば、また描く)。脱落したプレイヤーは描く。自分が決まるまでは誰も描かない。
 * CPU(kind=cpu)はサーバーが位置を配らないので、見た目だけクライアントでその場をうろうろさせる
 */
export function RemotePlayers() {
  const myPlayerId = useMyPlayerId();
  const {players} = usePlayersState();
  if (myPlayerId === null) {
    return null;
  }
  return (
    <>
      {players
        .filter(
          (p) => p.playerId !== myPlayerId && p.connection !== "disconnected",
        )
        .map((p) => (
          <RemotePlayer key={p.playerId} player={p} />
        ))}
    </>
  );
}
