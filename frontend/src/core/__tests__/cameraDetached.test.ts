import {afterEach, describe, expect, it, vi} from "vitest";

import {
  isCameraDetached,
  setCameraDetached,
  subscribeCameraDetached,
} from "../cameraDetached";

afterEach(() => setCameraDetached(false));

describe("cameraDetached", () => {
  it("値を切り替えられる", () => {
    expect(isCameraDetached()).toBe(false);
    setCameraDetached(true);
    expect(isCameraDetached()).toBe(true);
  });

  it("同じ値を毎フレーム書いても、変わったときにしか通知しない", () => {
    const onChange = vi.fn();
    const off = subscribeCameraDetached(onChange);

    for (const v of [false, true, true, true, false, false]) {
      setCameraDetached(v);
    }

    expect(onChange).toHaveBeenCalledTimes(2);
    off();
  });
});
