import {describe, expect, it, vi} from "vitest";

import {markSceneReady, resetSceneReady, whenSceneReady} from "../sceneReady";

// 他のテストと状態を分けるため、シーン名は固有に分ける
describe("sceneReady", () => {
  it("待っている間に mark されると resolve する", async () => {
    const onReady = vi.fn();
    const p = whenSceneReady("room").then(onReady);
    expect(onReady).not.toHaveBeenCalled();
    markSceneReady("room");
    await p;
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("mark 済みなら即 resolve する", async () => {
    markSceneReady("sandbox");
    await expect(whenSceneReady("sandbox")).resolves.toBeUndefined();
  });

  it("reset すると、前の mark は無効になり、次の mark を待つ", async () => {
    markSceneReady("multiplayer");
    resetSceneReady("multiplayer");
    const onReady = vi.fn();
    const p = whenSceneReady("multiplayer").then(onReady);
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    markSceneReady("multiplayer");
    await p;
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("別のシーンの mark では resolve しない", async () => {
    const onReady = vi.fn();
    void whenSceneReady("test").then(onReady);
    markSceneReady("room");
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
  });
});
