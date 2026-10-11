import {useEffect} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {beginElimination} from "../core/spectate";
import {usePlayersState} from "../player";

export function SpectateOnElimination() {
  const myPlayerId = useMyPlayerId();
  const {players} = usePlayersState();
  const eliminated =
    players.find((p) => p.playerId === myPlayerId)?.life === "eliminated";

  useEffect(() => {
    if (eliminated) {
      beginElimination();
    }
  }, [eliminated]);

  return null;
}
