import {describe, expect, it, vi} from "vitest";

import {createToggleStore} from "../toggles";

describe("createToggleStore", () => {
  it("初期状態は、どのキーも表示・機能 ON", () => {
    const store = createToggleStore();
    expect(store.isVisible("chair")).toBe(true);
    expect(store.isEnabled("chair")).toBe(true);
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
