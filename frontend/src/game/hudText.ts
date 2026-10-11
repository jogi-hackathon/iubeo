import type {FlowNotice, GameFlowState} from "../flow";
import type {GameResult, GameTask, TaskType} from "../net";
import {remainingMs, type GameState} from "./gameStore";

export const taskLabels: Record<TaskType, string> = {
  read_edit: "読み込みと編集",
  write: "書き込み",
  web_search: "検索",
  image_generation: "画像生成",
};

export const noticeLabels: Record<FlowNotice, string> = {
  replaced: "別のタブで入り直したため、ここは切れました",
  dissolved: "人数がそろわず、セッションは解散しました",
  abandoned: "全員が切断したままになったので、セッションは破棄されました",
  lost: "接続が切れ、再接続できませんでした",
};

export type HudLine = {text: string; color?: string};

export const taskLine = (task: GameTask, color?: string): HudLine => ({
  text: `${task.status === "completed" ? "☑" : "☐"} ${taskLabels[task.type]}`,
  ...(color === undefined ? {} : {color}),
});

export const matchingLine = (
  flow: GameFlowState,
  game: GameState,
  now: number,
): string | null => {
  switch (flow.status) {
    case "issuing":
      return "マッチングを始めています…";
    case "queued": {
      if (!flow.queuedAt) {
        return "マッチング中…";
      }
      const sec = Math.max(
        0,
        Math.floor((now - Date.parse(flow.queuedAt)) / 1000),
      );
      return `マッチング中… ${sec}秒`;
    }
    case "matched":
    case "entering":
      return "セッションに入ります…";
    case "inSession":
      return game.phase === null && game.sessionStatus === "waiting"
        ? "他のプレイヤーを待っています…"
        : null;
    case "error":
      return `エラー: ${flow.message}`;
    default:
      return null;
  }
};

export const phaseLine = (game: GameState, now: number): string | null => {
  if (game.intermission || game.phase?.status === "intermission") {
    return "インターミッション";
  }
  if (!game.phase) {
    return null;
  }
  if (game.phase.status === "completed") {
    return `フェーズ ${game.phase.number} 完了`;
  }
  const remaining = remainingMs(game, now);
  if (remaining === null) {
    return `フェーズ ${game.phase.number}`;
  }
  return `フェーズ ${game.phase.number}　残り ${Math.max(
    0,
    Math.ceil(remaining / 1000),
  )}秒`;
};

export const resultLine = (result: GameResult | null): string | null =>
  result === null
    ? null
    : result.outcome === "victory"
      ? "結果: 勝利 (victory)"
      : "結果: 敗北 (defeat)";
