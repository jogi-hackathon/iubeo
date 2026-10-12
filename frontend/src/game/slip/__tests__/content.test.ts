import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../../net";
import {
  SAMPLE_SLIP,
  SLIP_CANVAS,
  SLIP_MAX_ITEMS,
  slipContent,
} from "../content";
import {SLIP_LENGTH, SLIP_WIDTH} from "../strip";

const phase: GamePhase = {
  number: 2,
  status: "active",
  startedAt: "2026-10-12T03:00:00Z",
  deadlineAt: "2026-10-12T03:02:30Z",
  tasks: [],
};

const task = (over: Partial<GameTask>): GameTask => ({
  taskId: "1a2b3c4d-5e6f-7a8b-9c0d-ef1234567890",
  type: "write",
  assigneePlayerId: "p1",
  targetFileId: null,
  status: "pending",
  completedAt: null,
  ...over,
});

describe("slipContent", () => {
  it("番号はフェーズ番号と最初のタスク id から 8 桁、制限は開始と締切の差(秒)", () => {
    const content = slipContent(phase, [task({taskId: "task-2-1"})]);
    expect(content.number).toBe("2-TASK21");
    expect(content.phase).toBe(2);
    expect(content.items).toEqual([{kind: "書き込み", detail: null}]);
    expect(content.limitSeconds).toBe(150);
  });

  it("タスクは割り当ての順に項目になり、検索はお題、読み込みと編集は対象のファイルを対象にする", () => {
    const {items} = slipContent(phase, [
      task({type: "web_search", topic: "三葉虫"}),
      task({type: "read_edit", targetFileId: "file-7"}),
      task({type: "image_generation"}),
    ]);
    expect(items.map((item) => item.detail)).toEqual([
      "三葉虫",
      "file-7",
      null,
    ]);
    expect(items.map((item) => item.kind)).toEqual([
      "検索",
      "読み込みと編集",
      "画像生成",
    ]);
  });

  it("紙に収まらない分の項目は切る", () => {
    const many = Array.from({length: SLIP_MAX_ITEMS + 2}, () => task({}));
    expect(slipContent(phase, many).items).toHaveLength(SLIP_MAX_ITEMS);
  });

  it("日時が読めなければ制限は無し", () => {
    expect(
      slipContent({...phase, deadlineAt: "soon"}, [task({})]).limitSeconds,
    ).toBeNull();
  });

  it("描く canvas は紙の縦横比(58mm × 120mm)に合わせる", () => {
    expect(SLIP_CANVAS.height / SLIP_CANVAS.width).toBeCloseTo(
      SLIP_LENGTH / SLIP_WIDTH,
      2,
    );
    expect(SAMPLE_SLIP.items.length).toBeGreaterThan(1);
  });
});
