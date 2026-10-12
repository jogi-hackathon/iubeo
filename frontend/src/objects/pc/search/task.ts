import {useGameState} from "../../../game/gameStore";
import type {GamePhase} from "../../../net";
import type {PlayerId} from "../../../player/types";

export const currentTopic = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
): string | null => {
  if (!phase || playerId === null) {
    return null;
  }
  const task = phase.tasks.find(
    (t) =>
      t.type === "web_search" &&
      t.assigneePlayerId === playerId &&
      t.status !== "completed",
  );
  return task?.topic ?? null;
};

export const useTopicOf = (playerId: PlayerId | null): string | null =>
  currentTopic(useGameState().phase, playerId);
