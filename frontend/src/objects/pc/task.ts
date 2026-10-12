import {useGameState} from "../../game/gameStore";
import type {GamePhase} from "../../net";
import type {PlayerId} from "../../player/types";

/**
 * その人の未完了の Web 検索タスクのお題(フェーズの先頭のもの)。
 * お題はサーバーがタスクごとに決める。完了すると、次の未完了タスクのお題に変わる。
 */
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

/** PC の持ち主のお題。メモに出し、判定にも使う */
export const useTopicOf = (playerId: PlayerId | null): string | null =>
  currentTopic(useGameState().phase, playerId);
