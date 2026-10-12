import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../../../net";
import {currentTopic} from "../task";

const task = (overrides: Partial<GameTask> = {}): GameTask => ({
  taskId: "task-1-1",
  type: "web_search",
  assigneePlayerId: "me",
  targetFileId: null,
  topic: "WebAssembly",
  status: "pending",
  completedAt: null,
  ...overrides,
});

const phase = (tasks: GameTask[]): GamePhase => ({
  number: 2,
  status: "active",
  startedAt: "2026-10-01T00:00:00Z",
  deadlineAt: "2026-10-01T00:01:00Z",
  tasks,
});

describe("currentTopic", () => {
  it("自分の未完了の検索タスクのお題を返す", () => {
    expect(currentTopic(phase([task()]), "me")).toBe("WebAssembly");
  });

  it("フェーズが無い・プレイヤーが不明ならお題は無い", () => {
    expect(currentTopic(null, "me")).toBeNull();
    expect(currentTopic(phase([task()]), null)).toBeNull();
  });

  it("他人の検索タスクや、検索以外のタスクは選ばない", () => {
    const tasks = [
      task({taskId: "task-1-1", assigneePlayerId: "someone-else"}),
      task({taskId: "task-1-2", type: "write", topic: null}),
    ];
    expect(currentTopic(phase(tasks), "me")).toBeNull();
  });

  it("完了した検索はスキップし、次の未完了のお題にする", () => {
    const tasks = [
      task({taskId: "task-2-1", topic: "Vite", status: "completed"}),
      task({taskId: "task-2-2", topic: "three.js"}),
    ];
    expect(currentTopic(phase(tasks), "me")).toBe("three.js");
  });

  it("未完了の検索が複数あれば、先頭のタスクのお題を出す", () => {
    const tasks = [
      task({taskId: "task-2-1", topic: "Vite"}),
      task({taskId: "task-2-2", topic: "three.js"}),
    ];
    expect(currentTopic(phase(tasks), "me")).toBe("Vite");
  });

  it("お題が無い検索タスクでは null を返す", () => {
    expect(currentTopic(phase([task({topic: null})]), "me")).toBeNull();
  });
});
