import {useFrame} from "@react-three/fiber";
import {useMemo, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {listColliders} from "../core/bvh";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {HeldItem} from "../items";
import {LIGHTER_KIND} from "../items/lighter";
import {useWorkingAtWorkspace} from "../objects/workspace/useWorkingAtWorkspace";
import {keepCpuClear} from "./cpuClearance";
import {playerManager} from "./playerStore";
import {PlayerSkeleton} from "./skeleton";
import {createPlayerState} from "./state";
import type {PlayerStatus} from "./types";
import {useFootsteps} from "./useFootsteps";
import {useLighterSound} from "./useLighterSound";
import {usePlayersState} from "./usePlayers";

function RemotePlayer({player}: {player: PlayerStatus}) {
  const state = useMemo(() => createPlayerState(0, 0, 0), []);
  const {playerId} = player;
  const heldItem = useWorkingAtWorkspace(playerId) ? null : player.heldItem;
  const [placed, setPlaced] = useState(false);
  const alive = placed && player.life !== "eliminated";
  useFootsteps(state, alive);
  useLighterSound(state, alive, heldItem?.kind === LIGHTER_KIND);

  useFrame(() => {
    const ok = playerManager.sample(playerId, performance.now(), state);
    if (ok && player.kind === "cpu") {
      keepCpuClear(state.position, listColliders());
    }
    if (ok !== placed) {
      setPlaced(ok);
    }
  }, FRAME_PRIORITY.player);

  return (
    <PlayerSkeleton
      state={state}
      visible={placed}
      ragdoll={player.life === "eliminated"}
      holding={heldItem !== null}
      handItem={heldItem && <HeldItem item={heldItem} />}
    />
  );
}

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
