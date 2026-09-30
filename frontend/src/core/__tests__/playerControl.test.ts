import {describe, expect, it, vi} from "vitest";

import {
  isPlayerControlLocked,
  lockPlayerControl,
  subscribePlayerControl,
} from "../playerControl";

describe("playerControl", () => {
  it("預かっている間だけ true になる", () => {
    expect(isPlayerControlLocked()).toBe(false);
    const release = lockPlayerControl();
    expect(isPlayerControlLocked()).toBe(true);
    release();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("重なった預かりは、全部解除されるまで続く", () => {
    const a = lockPlayerControl();
    const b = lockPlayerControl();
    a();
    expect(isPlayerControlLocked()).toBe(true);
    b();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("解除関数を二重に呼んでも、他の預かりを外さない", () => {
    const a = lockPlayerControl();
    const b = lockPlayerControl();
    a();
    a();
    expect(isPlayerControlLocked()).toBe(true);
    b();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("預かりの始まりと終わりのときだけ通知する(重なりの途中では通知しない)", () => {
    const onChange = vi.fn();
    const off = subscribePlayerControl(onChange);

    const a = lockPlayerControl();
    const b = lockPlayerControl();
    a();
    b();

    expect(onChange).toHaveBeenCalledTimes(2);
    off();
  });
});
