import {useFrame} from "@react-three/fiber";
import {useMemo, useState} from "react";

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
  // 位置が 1 つも届いていない間は描かない(原点に立って見えないように)
  const [placed, setPlaced] = useState(false);

  useFrame(() => {
    const ok = playerManager.sample(playerId, performance.now(), state);
    if (ok !== placed) {
      setPlaced(ok);
    }
  }, FRAME_PRIORITY.player);

  // TODO: 脱落(life が eliminated に変わった瞬間。playerManager の lifeChanged)でラグドールに移す。今は立ったまま描く
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
  const {localPlayerId, players} = usePlayersState();
  // 自分が決まるまでは、自分の身体を他のプレイヤーとして描いてしまうので、誰も描かない
  if (localPlayerId === null) {
    return null;
  }
  return (
    <>
      {players
        .filter(
          (p) =>
            p.playerId !== localPlayerId && p.connection !== "disconnected",
        )
        .map((p) => (
          <RemotePlayer key={p.playerId} player={p} />
        ))}
    </>
  );
}
