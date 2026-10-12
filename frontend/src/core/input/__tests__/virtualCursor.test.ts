import {describe, expect, it, vi} from "vitest";

import {CENTER_CURSOR, createVirtualCursor, moveCursor} from "../virtualCursor";

const VIEWPORT = {width: 1600, height: 900};

describe("moveCursor", () => {
  it("中央から始まる", () => {
    expect(CENTER_CURSOR).toEqual({x: 0, y: 0});
  });

  it("移動量は画面のピクセル数で NDC に直す(右で右、下で下)", () => {
    const c = moveCursor({x: 0, y: 0}, 400, 90, VIEWPORT);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(-0.2);
  });

  it("左・上へは逆向きに動く", () => {
    const c = moveCursor({x: 0, y: 0}, -160, -45, VIEWPORT);
    expect(c.x).toBeCloseTo(-0.2);
    expect(c.y).toBeCloseTo(0.1);
  });

  it("画面の外には出ない", () => {
    const c = moveCursor({x: 0.9, y: -0.9}, 1e6, 1e6, VIEWPORT);
    expect(c).toEqual({x: 1, y: -1});
    moveCursor(c, -1e6, -1e6, VIEWPORT);
    expect(c).toEqual({x: -1, y: 1});
  });
});

describe("createVirtualCursor", () => {
  it("中央から始まり、動いたときだけ通知して true を返す", () => {
    const cursor = createVirtualCursor();
    const listener = vi.fn();
    cursor.subscribe(listener);
    expect(cursor.get()).toEqual({x: 0, y: 0});

    expect(cursor.move(400, 0, VIEWPORT)).toBe(true);
    expect(cursor.get().x).toBeCloseTo(0.5);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(cursor.move(0, 0, VIEWPORT)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("端に張り付いたまま押しても、動かないので通知しない", () => {
    const cursor = createVirtualCursor();
    cursor.move(1e6, 0, VIEWPORT);
    const listener = vi.fn();
    cursor.subscribe(listener);
    expect(cursor.move(100, 0, VIEWPORT)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset で中央へ戻す(中央にいるときは通知しない)", () => {
    const cursor = createVirtualCursor();
    const listener = vi.fn();
    cursor.subscribe(listener);
    cursor.reset();
    expect(listener).not.toHaveBeenCalled();
    cursor.move(100, 100, VIEWPORT);
    cursor.reset();
    expect(cursor.get()).toEqual({x: 0, y: 0});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("別々に作ったカーソルは互いに動かさない", () => {
    const a = createVirtualCursor();
    const b = createVirtualCursor();
    a.move(400, 0, VIEWPORT);
    expect(b.get()).toEqual({x: 0, y: 0});
  });

  it("解除した購読者には通知しない", () => {
    const cursor = createVirtualCursor();
    const listener = vi.fn();
    const off = cursor.subscribe(listener);
    off();
    cursor.move(100, 0, VIEWPORT);
    expect(listener).not.toHaveBeenCalled();
  });
});
