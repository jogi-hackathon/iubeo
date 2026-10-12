import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../../net";
import {SAMPLE_SLIP} from "../content";
import {createMemosStore, isMemoDone} from "../memos";

describe("memos", () => {
  it("ワークスペースごとに最新の 1 枚を残し、clear で全部消える", () => {
    const store = createMemosStore();
    store.place("workspace-1", SAMPLE_SLIP);
    store.place("workspace-1", {...SAMPLE_SLIP, phase: 4});
    store.place("workspace-2", SAMPLE_SLIP);
    expect(store.getState().byWorkspace["workspace-1"]?.phase).toBe(4);
    expect(store.getState().byWorkspace["workspace-2"]).toBe(SAMPLE_SLIP);
    store.clear();
    expect(store.getState().byWorkspace).toEqual({});
  });
});

describe("isMemoDone", () => {
  const task = (over: Partial<GameTask>): GameTask => ({
    taskId: "task-3-1",
    type: "write",
    assigneePlayerId: "me",
    targetFileId: null,
    status: "pending",
    completedAt: null,
    ...over,
  });
  const phase = (over: Partial<GamePhase> = {}): GamePhase => ({
    number: SAMPLE_SLIP.phase,
    status: "active",
    startedAt: "2026-10-12T03:00:00Z",
    deadlineAt: "2026-10-12T03:02:00Z",
    tasks: [
      task({taskId: "task-3-1"}),
      task({taskId: "task-3-2", assigneePlayerId: "other"}),
    ],
    ...over,
  });

  it("同じフェーズで自分のタスクが全部達成済みなら終わり。他人のタスクは見ない", () => {
    expect(isMemoDone(SAMPLE_SLIP, phase(), "me")).toBe(false);
    expect(
      isMemoDone(
        SAMPLE_SLIP,
        phase({
          tasks: [
            task({status: "completed"}),
            task({taskId: "task-3-2", assigneePlayerId: "other"}),
          ],
        }),
        "me",
      ),
    ).toBe(true);
  });

  it("伝票のフェーズが過ぎていれば終わり。フェーズが分からなければ終わっていない", () => {
    expect(
      isMemoDone(SAMPLE_SLIP, phase({number: SAMPLE_SLIP.phase + 1}), "me"),
    ).toBe(true);
    expect(isMemoDone(SAMPLE_SLIP, null, "me")).toBe(false);
  });
});
