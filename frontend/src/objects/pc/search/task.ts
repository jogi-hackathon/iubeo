import {useGameState} from "../../../game/gameStore";
import type {GamePhase} from "../../../net";
import type {PlayerId} from "../../../player/types";

const currentSearchTask = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
) => {
  if (!phase || playerId === null) {
    return null;
  }
  return (
    phase.tasks.find(
      (t) =>
        t.type === "web_search" &&
        t.assigneePlayerId === playerId &&
        t.status !== "completed",
    ) ?? null
  );
};

export const currentTopic = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
): string | null => currentSearchTask(phase, playerId)?.topic ?? null;

export const currentSearchTaskId = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
): string | null => currentSearchTask(phase, playerId)?.taskId ?? null;

export const useTopicOf = (playerId: PlayerId | null): string | null =>
  currentTopic(useGameState().phase, playerId);

export const useSearchTaskIdOf = (playerId: PlayerId | null): string | null =>
  currentSearchTaskId(useGameState().phase, playerId);
