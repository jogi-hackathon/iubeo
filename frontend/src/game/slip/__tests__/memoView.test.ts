import {describe, expect, it} from "vitest";

import {createMemoViewStore} from "../memoView";

const setup = () => {
  const locks = {held: 0};
  const store = createMemoViewStore({
    lock: () => {
      locks.held++;
      return () => {
        locks.held--;
      };
    },
  });
  return {store, locks};
};

describe("memoView", () => {
  it("寄っている間は操作を預かり、戻りきったら返す", () => {
    const {store, locks} = setup();
    expect(store.enter("workspace-1")).toBe(true);
    expect(store.getState()).toEqual({
      phase: "active",
      workspaceId: "workspace-1",
    });
    expect(locks.held).toBe(1);
    store.leave();
    expect(store.getState().phase).toBe("leaving");
    expect(locks.held).toBe(1);
    store.finish();
    expect(store.getState()).toEqual({phase: "idle", workspaceId: null});
    expect(locks.held).toBe(0);
  });

  it("寄っている間はもう一度入らず、戻る前の finish は無視する", () => {
    const {store, locks} = setup();
    store.enter("workspace-1");
    expect(store.enter("workspace-2")).toBe(false);
    store.finish();
    expect(store.getState().phase).toBe("active");
    expect(locks.held).toBe(1);
  });

  it("reset はどの段からでも預かりを返して idle にする", () => {
    const {store, locks} = setup();
    store.enter("workspace-1");
    store.reset();
    expect(store.getState().phase).toBe("idle");
    expect(locks.held).toBe(0);
    store.reset();
    expect(locks.held).toBe(0);
  });
});
