import {describe, expect, it, vi} from "vitest";

import {createCreditsStore} from "../store";

const make = () => {
  const release = vi.fn();
  const lock = vi.fn(() => release);
  const store = createCreditsStore({lock});
  return {store, lock, release};
};

describe("createCreditsStore", () => {
  it("初期状態は一人称(idle)", () => {
    expect(make().store.getPhase()).toBe("idle");
  });

  it("enter で流し始め、プレイヤーを預かる。二重には入らない", () => {
    const {store, lock} = make();
    expect(store.enter()).toBe(true);
    expect(store.getPhase()).toBe("active");
    expect(store.enter()).toBe(false);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("leave の後、戻り終える(finish)まではプレイヤーを預かったまま", () => {
    const {store, release} = make();
    store.enter();
    store.leave();
    expect(store.getPhase()).toBe("leaving");
    expect(release).not.toHaveBeenCalled();
    store.finish();
    expect(store.getPhase()).toBe("idle");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("流れていないときの leave・finish は何もしない", () => {
    const {store, release} = make();
    store.leave();
    store.finish();
    expect(store.getPhase()).toBe("idle");
    expect(release).not.toHaveBeenCalled();
  });

  it("reset はどの段階からでもすぐ一人称に戻し、預かりを返す", () => {
    const {store, release} = make();
    store.enter();
    store.reset();
    expect(store.getPhase()).toBe("idle");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
