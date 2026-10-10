import {describe, expect, it, vi} from "vitest";

import {
  getClientTarget,
  hasClientTarget,
  registerClientTarget,
} from "../clientTargets";

describe("clientTargets", () => {
  it("登録した処理を引け、解除で外れる", () => {
    const interact = vi.fn();
    const off = registerClientTarget("room.button", {interact});
    expect(hasClientTarget("room.button")).toBe(true);
    getClientTarget("room.button")?.interact();
    expect(interact).toHaveBeenCalledTimes(1);

    off();
    expect(hasClientTarget("room.button")).toBe(false);
    expect(getClientTarget("room.button")).toBeUndefined();
  });

  it("入れ替わった後の古い解除関数は、新しい処理を外さない", () => {
    const first = {interact: vi.fn()};
    const second = {interact: vi.fn()};
    const offFirst = registerClientTarget("room.button", first);
    const offSecond = registerClientTarget("room.button", second);

    offFirst();
    expect(getClientTarget("room.button")).toBe(second);
    offSecond();
    expect(hasClientTarget("room.button")).toBe(false);
  });
});
