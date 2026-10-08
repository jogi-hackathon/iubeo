import {describe, expect, it, vi} from "vitest";

import type {GameObject} from "../../types";
import {createDirectoryInteraction} from "../interaction";

const directory: GameObject = {
  id: "d1",
  kind: "directory",
  scope: "shared",
  position: [0, 0, 0],
  users: [],
  availability: "available",
  data: {stock: [], outputs: 0},
};

describe("createDirectoryInteraction", () => {
  it("手ぶらなら、俯瞰に入って処理済み(サーバーには送らない)にする", () => {
    const enterOverview = vi.fn();
    const handle = createDirectoryInteraction({
      isHandEmpty: () => true,
      isOverviewEnabled: () => true,
      enterOverview,
    });

    expect(handle(directory)).toBe(true);
    expect(enterOverview).toHaveBeenCalledWith("d1");
  });

  it("何か持っていれば処理せず、既定の処理(要求を送る = 入れる)に任せる", () => {
    const enterOverview = vi.fn();
    const handle = createDirectoryInteraction({
      isHandEmpty: () => false,
      isOverviewEnabled: () => true,
      enterOverview,
    });

    expect(handle(directory)).toBe(false);
    expect(enterOverview).not.toHaveBeenCalled();
  });

  it("手ぶらでも、俯瞰の機能が OFF なら、俯瞰に入らず処理済み(何もしない)にする", () => {
    const enterOverview = vi.fn();
    const handle = createDirectoryInteraction({
      isHandEmpty: () => true,
      isOverviewEnabled: () => false,
      enterOverview,
    });

    expect(handle(directory)).toBe(true);
    expect(enterOverview).not.toHaveBeenCalled();
  });

  it("ファイルを持っていれば、俯瞰の機能が OFF でも処理せず、既定の処理(入れる)に任せる", () => {
    const enterOverview = vi.fn();
    const handle = createDirectoryInteraction({
      isHandEmpty: () => false,
      isOverviewEnabled: () => false,
      enterOverview,
    });

    expect(handle(directory)).toBe(false);
    expect(enterOverview).not.toHaveBeenCalled();
  });
});
