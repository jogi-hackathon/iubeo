import {describe, expect, it, vi} from "vitest";

import {createOverviewStore} from "../overview";

const make = () => {
  const release = vi.fn();
  const lock = vi.fn(() => release);
  const store = createOverviewStore({lock});
  return {store, lock, release};
};

describe("createOverviewStore", () => {
  it("初期状態は一人称(idle)", () => {
    expect(make().store.getState()).toEqual({
      phase: "idle",
      directoryId: null,
      aimedFileId: null,
      pending: false,
    });
  });

  it("enter で俯瞰に入り、プレイヤーを預かる", () => {
    const {store, lock} = make();
    expect(store.enter("d1")).toBe(true);
    expect(store.getState()).toMatchObject({
      phase: "active",
      directoryId: "d1",
    });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("入っている間・戻る間の enter は無視する", () => {
    const {store, lock} = make();
    store.enter("d1");
    expect(store.enter("d2")).toBe(false);
    store.leave();
    expect(store.enter("d2")).toBe(false);
    expect(store.getState().directoryId).toBe("d1");
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("leave で戻り始めても、finish までプレイヤーは預かったまま", () => {
    const {store, release} = make();
    store.enter("d1");
    store.leave();
    expect(store.getState().phase).toBe("leaving");
    expect(release).not.toHaveBeenCalled();

    store.finish();
    expect(store.getState()).toEqual({
      phase: "idle",
      directoryId: null,
      aimedFileId: null,
      pending: false,
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("俯瞰中でなければ leave / finish は何もしない。戻る前の finish も無視する", () => {
    const {store, release} = make();
    const before = store.getState();
    store.leave();
    store.finish();
    expect(store.getState()).toBe(before);

    store.enter("d1");
    store.finish();
    expect(store.getState().phase).toBe("active");
    expect(release).not.toHaveBeenCalled();
  });

  it("reset は補間を待たず、すぐ一人称に戻してプレイヤーを返す", () => {
    const {store, release} = make();
    store.enter("d1");
    store.reset();
    expect(store.getState().phase).toBe("idle");
    expect(release).toHaveBeenCalledTimes(1);

    store.reset();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("狙っているファイルは active の間だけ持ち、戻り始めると消える", () => {
    const {store} = make();
    store.setAimedFile("f1");
    expect(store.getState().aimedFileId).toBeNull();

    store.enter("d1");
    store.setAimedFile("f1");
    expect(store.getState().aimedFileId).toBe("f1");

    store.leave();
    expect(store.getState().aimedFileId).toBeNull();
    store.setAimedFile("f2");
    expect(store.getState().aimedFileId).toBeNull();
  });

  it("同じ値の setAimedFile は通知しない。変わったら state の参照も変わる", () => {
    const {store} = make();
    store.enter("d1");
    const onChange = vi.fn();
    store.subscribe(onChange);

    store.setAimedFile("f1");
    const before = store.getState();
    store.setAimedFile("f1");
    expect(store.getState()).toBe(before);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("解除関数で subscribe を外せ、購読側の例外が他に影響しない", () => {
    const {store} = make();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = vi.fn();
    store.subscribe(() => {
      throw new Error("boom");
    });
    const off = store.subscribe(ok);

    store.enter("d1");
    expect(ok).toHaveBeenCalledTimes(1);

    off();
    store.leave();
    expect(ok).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  describe("取り出し要求中", () => {
    it("要求中は、次の要求を受け付けない。結果が来たら再び受け付ける", () => {
      const {store} = make();
      store.enter("d1");

      expect(store.beginRequest()).toBe(true);
      expect(store.getState().pending).toBe(true);
      expect(store.beginRequest()).toBe(false);

      store.endRequest();
      expect(store.getState().pending).toBe(false);
      expect(store.beginRequest()).toBe(true);
    });

    it("俯瞰中でなければ要求できない", () => {
      const {store} = make();
      expect(store.beginRequest()).toBe(false);
      store.enter("d1");
      store.leave();
      expect(store.beginRequest()).toBe(false);
    });

    it("俯瞰を抜けたら、要求中は解除される", () => {
      const {store} = make();
      store.enter("d1");
      store.beginRequest();
      store.leave();
      expect(store.getState().pending).toBe(false);

      store.finish();
      store.enter("d1");
      expect(store.getState().pending).toBe(false);

      store.beginRequest();
      store.reset();
      expect(store.getState().pending).toBe(false);
    });
  });
});
