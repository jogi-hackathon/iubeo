import {useEffect} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {beginElimination} from "../core/spectate";
import {usePlayersState} from "../player";

/**
 * 自分が脱落したら、観戦の演出を始める(beginElimination が演出の後で FlyCamera の観戦へ移す)。
 * 生死はサーバーの player.updated が正で、その写し(playerManager)を読む。判定はしない(ADR-0003)
 */
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
