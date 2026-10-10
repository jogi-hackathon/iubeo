import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../net";
import type {GameState} from "../gameStore";
import {
  matchingLine,
  noticeLabels,
  phaseLine,
  resultLine,
  taskLine,
} from "../hudText";

const at = (ms: number) => new Date(ms).toISOString();

const task = (overrides: Partial<GameTask> = {}): GameTask => ({
  taskId: "task-1-1",
  type: "read_edit",
  assigneePlayerId: "me",
  targetFileId: "file-01",
  status: "pending",
  completedAt: null,
  ...overrides,
});

const phase = (overrides: Partial<GamePhase> = {}): GamePhase => ({
  number: 2,
  status: "active",
  startedAt: at(0),
  deadlineAt: at(6_000),
  tasks: [task()],
  ...overrides,
});

const game = (overrides: Partial<GameState> = {}): GameState => ({
  sessionStatus: "playing",
  phase: null,
  intermission: false,
  result: null,
  serverOffsetMs: 0,
  ...overrides,
});

describe("hudText", () => {
  it("タスクは、達成でチェックを付ける", () => {
    expect(taskLine(task())).toBe("☐ 読み込みと編集 (file-01)");
    expect(taskLine(task({status: "completed"}))).toBe(
      "☑ 読み込みと編集 (file-01)",
    );
    expect(
      taskLine(
        task({
          type: "image_generation",
          targetFileId: null,
          status: "completed",
        }),
      ),
    ).toBe("☑ 画像生成");
  });

  it("マッチングと待機の状態を出す", () => {
    expect(matchingLine({status: "issuing"}, game(), 0)).toBe(
      "マッチングを始めています…",
    );
    expect(
      matchingLine(
        {status: "queued", playerId: "p1", queuedAt: at(0)},
        game(),
        12_000,
      ),
    ).toBe("マッチング中… 12秒");
    expect(matchingLine({status: "idle"}, game(), 0)).toBeNull();
  });

  it("待機は、最初のフェーズが来るまで出す", () => {
    expect(
      matchingLine(
        {status: "inSession", playerId: "p1", sessionId: "s1"},
        game({sessionStatus: "waiting"}),
        0,
      ),
    ).toBe("他のプレイヤーを待っています…");
    // 始まっていれば出さない
    expect(
      matchingLine(
        {status: "inSession", playerId: "p1", sessionId: "s1"},
        game({sessionStatus: "playing", phase: phase()}),
        0,
      ),
    ).toBeNull();
  });

  it("フェーズ番号と残り秒数をサーバー時刻から出す", () => {
    expect(phaseLine(game({phase: phase()}), 1_000)).toBe(
      "フェーズ 2　残り 5秒",
    );
    // 端末の時計がサーバーより 1 秒遅れていても、サーバー時刻で数える(5 秒ではなく 4 秒)
    expect(
      phaseLine(game({phase: phase(), serverOffsetMs: 1_000}), 1_000),
    ).toBe("フェーズ 2　残り 4秒");
  });

  it("intermission の間は残り時間を出さず、最後のフェーズは完了と出す", () => {
    expect(phaseLine(game({intermission: true}), 0)).toBe("インターミッション");
    // フラグが無くても、フェーズの状態から出す(intermission 中の再接続の snapshot)
    expect(phaseLine(game({phase: phase({status: "intermission"})}), 0)).toBe(
      "インターミッション",
    );
    expect(
      phaseLine(game({phase: phase({number: 3, status: "completed"})}), 0),
    ).toBe("フェーズ 3 完了");
    expect(phaseLine(game(), 0)).toBeNull();
  });

  it("決着の結果を出し、切断の理由は文言を持つ", () => {
    expect(resultLine({outcome: "victory", decidedAt: at(0)})).toBe(
      "結果: 勝利 (victory)",
    );
    expect(resultLine({outcome: "defeat", decidedAt: at(0)})).toBe(
      "結果: 敗北 (defeat)",
    );
    expect(resultLine(null)).toBeNull();
    for (const label of Object.values(noticeLabels)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
