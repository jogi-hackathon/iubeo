import {useGameState} from "../../../game/gameStore";
import type {GamePhase} from "../../../net";
import type {PlayerId} from "../../../player/types";

/** その人の未完了の Web 検索タスク(フェーズの先頭のもの)。完了すると、次の未完了タスクに変わる */
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

/** その人の未完了の Web 検索タスクのお題。お題はサーバーがタスクごとに決める */
export const currentTopic = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
): string | null => currentSearchTask(phase, playerId)?.topic ?? null;

/** その人の未完了の Web 検索タスクの ID。新しいタスクが来たことを知るのに使う */
export const currentSearchTaskId = (
  phase: GamePhase | null,
  playerId: PlayerId | null,
): string | null => currentSearchTask(phase, playerId)?.taskId ?? null;

/** PC の持ち主のお題。メモに出し、判定にも使う */
export const useTopicOf = (playerId: PlayerId | null): string | null =>
  currentTopic(useGameState().phase, playerId);

/** PC の持ち主の、今の Web 検索タスクの ID */
export const useSearchTaskIdOf = (playerId: PlayerId | null): string | null =>
  currentSearchTaskId(useGameState().phase, playerId);
