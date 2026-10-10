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

function RemotePlayer({player}: {player: PlayerStatus}) {
  const state = useMemo(() => createPlayerState(0, 0, 0), []);
  const {playerId, heldItem} = player;
  const [placed, setPlaced] = useState(false);

  useFrame(() => {
    const ok = playerManager.sample(playerId, performance.now(), state);
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
 * 切断中のプレイヤーは描かない(再接続すれば、また描く)。脱落したプレイヤーは描く。自分が決まるまでは誰も描かない
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
