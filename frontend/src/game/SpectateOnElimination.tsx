import {useEffect} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {sfxEngine} from "../core/audio/sfx/engine";
import {beginElimination} from "../core/spectate";
import {usePlayersState} from "../player";
import {TaskSounds} from "./TaskSounds";

export function SpectateOnElimination() {
  const myPlayerId = useMyPlayerId();
  const {players} = usePlayersState();
  const eliminated =
    players.find((p) => p.playerId === myPlayerId)?.life === "eliminated";

  useEffect(() => {
    if (eliminated) {
      beginElimination();
      sfxEngine.them("shatter");
    }
  }, [eliminated]);

  return <TaskSounds />;
}
