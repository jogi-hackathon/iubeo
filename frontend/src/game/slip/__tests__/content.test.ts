import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../../net";
import {colorName, SAMPLE_SLIP, SLIP_CANVAS, slipContent} from "../content";
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

  it("タスクは割り当ての順に項目になり、検索はお題、読み込みと編集は対象のファイルの色を対象にする", () => {
    const {items} = slipContent(
      phase,
      [
        task({type: "web_search", topic: "三葉虫"}),
        task({type: "read_edit", targetFileId: "file-7"}),
        task({type: "image_generation"}),
      ],
      new Map([["file-7", "#1d6fe0"]]),
    );
    expect(items.map((item) => item.detail)).toEqual([
      "三葉虫",
      "青のファイル",
      null,
    ]);
    expect(items.map((item) => item.kind)).toEqual([
      "検索",
      "読み込みと編集",
      "画像生成",
    ]);
  });

  it("対象ファイルの色が分からなければ、id は出さずに対象無しにする", () => {
    const {items} = slipContent(phase, [
      task({type: "read_edit", targetFileId: "file-7"}),
    ]);
    expect(items[0]?.detail).toBeNull();
  });

  it("項目が多くても切らずに全部載せる", () => {
    const many = Array.from({length: 9}, () => task({}));
    expect(slipContent(phase, many).items).toHaveLength(9);
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

describe("colorName", () => {
  it("山の紙の 6 色を色相で呼び分ける", () => {
    expect(
      ["#e63946", "#f4a261", "#ffd60a", "#2a9d5c", "#1d6fe0", "#9b5de5"].map(
        colorName,
      ),
    ).toEqual(["赤", "橙", "黄", "緑", "青", "紫"]);
  });

  it("色味の無い色は白・灰・黒、読めない書き方は null", () => {
    expect(colorName("#ffffff")).toBe("白");
    expect(colorName("#808080")).toBe("灰");
    expect(colorName("#101010")).toBe("黒");
    expect(colorName("red")).toBeNull();
  });
});
