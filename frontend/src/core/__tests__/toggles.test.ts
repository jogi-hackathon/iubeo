import {afterEach, describe, expect, it, vi} from "vitest";

import {
  createToggleStore,
  getActiveToggles,
  registerActiveToggles,
  subscribeActiveToggles,
} from "../toggles";

describe("createToggleStore", () => {
  it("初期状態は、どのキーも表示・機能 ON", () => {
    const store = createToggleStore();
    expect(store.isVisible("chair")).toBe(true);
    expect(store.isEnabled("chair")).toBe(true);
  });

  it("初期状態を渡すと、そのキーだけ最初から非表示・機能 OFF。他のキーは表示・機能 ON", () => {
    const store = createToggleStore({
      hidden: ["window"],
      disabled: ["directory:overview"],
    });
    expect(store.isVisible("window")).toBe(false);
    expect(store.isEnabled("window")).toBe(false);
    expect(store.isVisible("directory:overview")).toBe(true);
    expect(store.isEnabled("directory:overview")).toBe(false);
    expect(store.isEnabled("chair")).toBe(true);
    expect(store.isVisible("chair")).toBe(true);
  });

  it("初期状態で機能 OFF にしたキーは、あとから ON にできる。ストアごとに独立していて、渡した配列は変わらない", () => {
    const disabled = ["directory:overview"];
    const store = createToggleStore({disabled});
    const other = createToggleStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setEnabled("directory:overview", true);

    expect(store.isEnabled("directory:overview")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(disabled).toEqual(["directory:overview"]);
    expect(other.isEnabled("directory:overview")).toBe(true);
    expect(createToggleStore({disabled}).isEnabled("directory:overview")).toBe(
      false,
    );
  });

  it("setVisible(key, false) で非表示、true で表示に戻る。他のキーは変わらない", () => {
    const store = createToggleStore();

    store.setVisible("chair", false);
    expect(store.isVisible("chair")).toBe(false);
    expect(store.isVisible("directory")).toBe(true);

    store.setVisible("chair", true);
    expect(store.isVisible("chair")).toBe(true);
  });

  it("機能 OFF でも表示のまま。表示とは別の値で持つ", () => {
    const store = createToggleStore();

    store.setEnabled("canvas", false);

    expect(store.isEnabled("canvas")).toBe(false);
    expect(store.isVisible("canvas")).toBe(true);
    expect(store.isEnabled("workspace")).toBe(true);
  });

  it("非表示の間は機能も OFF として扱い、表示に戻すと、機能は元の設定に戻る", () => {
    const store = createToggleStore();

    store.setVisible("canvas", false);
    expect(store.isEnabled("canvas")).toBe(false);
    store.setVisible("canvas", true);
    expect(store.isEnabled("canvas")).toBe(true);

    store.setEnabled("canvas", false);
    store.setVisible("canvas", false);
    store.setVisible("canvas", true);
    expect(store.isEnabled("canvas")).toBe(false);
    store.setEnabled("canvas", true);
    expect(store.isEnabled("canvas")).toBe(true);
  });

  it("切り替えのたびに新しい state を返し、古い state は変わらない。通知する", () => {
    const store = createToggleStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getState();

    store.setVisible("chair", false);
    store.setEnabled("pc", false);

    expect(store.getState()).not.toBe(before);
    expect(before.hidden.size).toBe(0);
    expect(before.disabled.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("今と同じ値への切り替えは、state を変えず通知もしない", () => {
    const store = createToggleStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setVisible("chair", true);
    store.setEnabled("pc", true);
    expect(listener).not.toHaveBeenCalled();

    store.setVisible("chair", false);
    store.setEnabled("pc", false);
    const settled = store.getState();
    store.setVisible("chair", false);
    store.setEnabled("pc", false);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState()).toBe(settled);
  });

  it("購読の解除後は通知しない。コールバックが例外を投げても、他のコールバックは呼ぶ", () => {
    const store = createToggleStore();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const off = store.subscribe(good);
    store.subscribe(bad);

    store.setVisible("chair", false);
    off();
    store.setVisible("chair", true);

    expect(bad).toHaveBeenCalledTimes(2);
    expect(good).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("アクティブなトグルの登録簿", () => {
  const offs: (() => void)[] = [];
  const register = (store: ReturnType<typeof createToggleStore>) => {
    const off = registerActiveToggles(store);
    offs.push(off);
    return off;
  };

  afterEach(() => {
    for (const off of offs.splice(0)) {
      off();
    }
    vi.restoreAllMocks();
  });

  it("登録が無ければ null", () => {
    expect(getActiveToggles()).toBeNull();
  });

  it("登録したストアが今のシーンのトグルになり、解除すると null に戻る", () => {
    const store = createToggleStore();
    const off = register(store);
    expect(getActiveToggles()).toBe(store);

    off();
    expect(getActiveToggles()).toBeNull();
  });

  it("登録・解除のたびに購読へ通知する。解除関数を二重に呼んでも通知は 1 回", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveToggles(listener);
    const off = register(createToggleStore());
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    off();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    register(createToggleStore());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("シーンの入れ替えで新旧が重なっても、最後に登録された物が今のシーン。旧シーンの解除は新しい方に影響しない", () => {
    const oldStore = createToggleStore();
    const newStore = createToggleStore();
    const offOld = register(oldStore);
    register(newStore);
    expect(getActiveToggles()).toBe(newStore);

    offOld();
    expect(getActiveToggles()).toBe(newStore);
  });

  it("ストアの操作は、登録簿から引いたストアにも反映される(同じ物)", () => {
    const store = createToggleStore();
    register(store);
    getActiveToggles()?.setVisible("directory", false);
    expect(store.isVisible("directory")).toBe(false);
  });

  it("購読のコールバックが例外を投げても、他のコールバックは呼ぶ", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    const off1 = subscribeActiveToggles(() => {
      throw new Error("boom");
    });
    const off2 = subscribeActiveToggles(good);

    register(createToggleStore());

    expect(good).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });
});
