import {describe, expect, it, vi} from "vitest";

import type {GamePhase, GameTask} from "../../net";
import {createGameStore, remainingMs} from "../gameStore";

const at = (ms: number) => new Date(ms).toISOString();

const task = (
  taskId: string,
  status: GameTask["status"] = "pending",
): GameTask => ({
  taskId,
  type: "read_edit",
  assigneePlayerId: "me",
  targetFileId: "file-01",
  status,
  completedAt: null,
});

const phase = (overrides: Partial<GamePhase> = {}): GamePhase => ({
  number: 1,
  status: "active",
  startedAt: at(0),
  deadlineAt: at(30_000),
  tasks: [task("task-1-1")],
  ...overrides,
});

describe("gameStore", () => {
  it("snapshot でフェーズ・結果を入れ替え、サーバー時計のずれを持つ", () => {
    const base = 1_000_000;
    const store = createGameStore({now: () => base});
    store.applySnapshot({
      status: "playing",
      game: {phase: phase({deadlineAt: at(base + 500 + 30_000)}), result: null},
      serverTime: at(base + 500),
    });
    const state = store.getState();
    expect(state.sessionStatus).toBe("playing");
    expect(state.phase?.number).toBe(1);
    // 端末の時計はサーバーより 500ms 遅れている
    expect(state.serverOffsetMs).toBe(500);
    // 残り時間はサーバー時刻から見る(端末の時計を足さない)
    expect(remainingMs(state, base)).toBe(30_000);
  });

  it("phase.started でフェーズと時計を更新し、intermission を解除する", () => {
    const store = createGameStore({now: () => 0});
    store.phaseStarted(phase(), at(0));
    store.phaseEnded("intermission");
    expect(store.getState().intermission).toBe(true);

    store.phaseStarted(phase({number: 2}), at(5_000));
    const state = store.getState();
    expect(state.phase?.number).toBe(2);
    expect(state.intermission).toBe(false);
    expect(state.sessionStatus).toBe("playing");
    expect(state.serverOffsetMs).toBe(5_000);
  });

  it("phase.ended で intermission に入り、次が completed なら終わりにする", () => {
    const store = createGameStore();
    store.phaseStarted(phase(), at(0));
    store.phaseEnded("intermission");
    expect(store.getState().intermission).toBe(true);
    expect(store.getState().phase?.status).toBe("intermission");
    // 締切は過ぎているので、残り時間は出さない
    expect(remainingMs(store.getState(), 60_000)).toBeNull();

    store.phaseStarted(phase({number: 3}), at(40_000));
    store.phaseEnded("completed");
    expect(store.getState().intermission).toBe(false);
    expect(store.getState().phase?.status).toBe("completed");
  });

  it("intermission 中に再接続した snapshot でも、intermission の表示に戻す", () => {
    const store = createGameStore();
    store.applySnapshot({
      status: "intermission",
      game: {phase: phase({status: "intermission"}), result: null},
      serverTime: at(0),
    });
    expect(store.getState().intermission).toBe(true);
    expect(remainingMs(store.getState(), 60_000)).toBeNull();
  });

  it("task.completed で、そのタスクだけを完了にする", () => {
    const store = createGameStore();
    store.phaseStarted(
      phase({tasks: [task("task-1-1"), task("task-1-2")]}),
      at(0),
    );
    store.taskCompleted("task-1-2", at(1_000));
    const tasks = store.getState().phase!.tasks;
    expect(tasks.map((t) => t.status)).toEqual(["pending", "completed"]);
    expect(tasks[1]!.completedAt).toBe(at(1_000));

    // 同じ通知を二度受けても、completedAt は最初のまま
    store.taskCompleted("task-1-2", at(9_000));
    expect(store.getState().phase!.tasks[1]!.completedAt).toBe(at(1_000));
  });

  it("フェーズが無いときの task.completed は捨てる", () => {
    const store = createGameStore();
    store.taskCompleted("task-1-1", at(0));
    expect(store.getState().phase).toBeNull();
  });

  it("finished は結果(victory / defeat)を console に出して持ち、reset では残す", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const store = createGameStore();
    const victory = {outcome: "victory" as const, decidedAt: at(1_000)};
    store.finished(victory);
    expect(store.getState().result).toEqual(victory);
    expect(log).toHaveBeenCalledWith("[game] 決着: victory", victory);

    const defeat = {outcome: "defeat" as const, decidedAt: at(2_000)};
    store.finished(defeat);
    expect(log).toHaveBeenCalledWith("[game] 決着: defeat", defeat);

    store.reset();
    expect(store.getState().phase).toBeNull();
    expect(store.getState().sessionStatus).toBeNull();
    // room へ戻った後も HUD が結果を出せるよう、結果は残す
    expect(store.getState().result).toEqual(defeat);
    log.mockRestore();
  });

  it("新しい session の snapshot では、前の結果も入れ替える", () => {
    const store = createGameStore();
    store.finished({outcome: "defeat", decidedAt: at(1_000)});
    store.applySnapshot({
      status: "waiting",
      game: {phase: null, result: null},
      serverTime: at(2_000),
    });
    expect(store.getState().result).toBeNull();
  });

  it("購読者に通知する", () => {
    const store = createGameStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.phaseStarted(phase(), at(0));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
