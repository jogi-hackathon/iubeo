import {afterEach, describe, expect, it, vi} from "vitest";

import {
  connectPointerLock,
  consumeLookDelta,
  isPointerLocked,
} from "../pointerLock";

type Handler = (e?: unknown) => void;

/** DOM の最小モック。target と document(ownerDocument)だけを備える */
const createDom = (
  requestPointerLock: (options?: unknown) => unknown = () => undefined,
) => {
  const handlers = new Map<string, Set<Handler>>();
  const emitter = () => ({
    addEventListener: (type: string, h: Handler) => {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)?.add(h);
    },
    removeEventListener: (type: string, h: Handler) => {
      handlers.get(type)?.delete(h);
    },
  });
  const doc = {...emitter(), pointerLockElement: null as unknown};
  const target = {
    ...emitter(),
    ownerDocument: doc,
    requestPointerLock: vi.fn(requestPointerLock),
  };
  const emit = (type: string, e?: unknown) => {
    const snapshot = [...(handlers.get(type) ?? [])];
    for (const h of snapshot) {
      h(e);
    }
  };
  const setLock = (locked: boolean) => {
    doc.pointerLockElement = locked ? target : null;
    emit("pointerlockchange");
  };
  const count = () => [...handlers.values()].reduce((n, s) => n + s.size, 0);
  return {
    target: target as unknown as HTMLElement,
    mock: target,
    emit,
    setLock,
    count,
  };
};

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
});

describe("pointerLock 蓄積", () => {
  it("ロック中の movement を累積し、consume で取り出してゼロに戻す", () => {
    const dom = createDom();
    disconnect = connectPointerLock(dom.target);
    dom.setLock(true);
    dom.emit("mousemove", {movementX: 3, movementY: -1});
    dom.emit("mousemove", {movementX: 2, movementY: 4});
    expect(consumeLookDelta()).toEqual({dx: 5, dy: 3});
    expect(consumeLookDelta()).toEqual({dx: 0, dy: 0});
  });

  it("ロックされていない間の movement は無視する", () => {
    const dom = createDom();
    disconnect = connectPointerLock(dom.target);
    dom.emit("mousemove", {movementX: 9, movementY: 9});
    expect(consumeLookDelta()).toEqual({dx: 0, dy: 0});
  });

  it("unlock で未消費の累積を捨てる", () => {
    const dom = createDom();
    disconnect = connectPointerLock(dom.target);
    dom.setLock(true);
    expect(isPointerLocked()).toBe(true);
    dom.emit("mousemove", {movementX: 7, movementY: 7});
    dom.setLock(false);
    expect(isPointerLocked()).toBe(false);
    expect(consumeLookDelta()).toEqual({dx: 0, dy: 0});
  });

  it("disconnect でリスナーを外し、ロック状態を戻す", () => {
    const dom = createDom();
    const off = connectPointerLock(dom.target);
    dom.setLock(true);
    off();
    expect(dom.count()).toBe(0);
    expect(isPointerLocked()).toBe(false);
  });
});

describe("pointerLock 要求", () => {
  it("クリックで unadjustedMovement 付きで要求する", () => {
    const dom = createDom();
    disconnect = connectPointerLock(dom.target);
    dom.emit("click");
    expect(dom.mock.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(dom.mock.requestPointerLock).toHaveBeenCalledWith({
      unadjustedMovement: true,
    });
  });

  const domError = (name: string) => Object.assign(new Error(name), {name});

  it("NotSupportedError なら引数なしで再試行する", async () => {
    const dom = createDom((options) =>
      options
        ? Promise.reject(domError("NotSupportedError"))
        : Promise.resolve(),
    );
    disconnect = connectPointerLock(dom.target);
    dom.emit("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(dom.mock.requestPointerLock).toHaveBeenCalledTimes(2);
    expect(dom.mock.requestPointerLock).toHaveBeenLastCalledWith();
  });

  it("NotSupportedError 以外(再ロック制限など)では再試行しない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dom = createDom(() => Promise.reject(domError("SecurityError")));
    disconnect = connectPointerLock(dom.target);
    dom.emit("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(dom.mock.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("Promise を返さない実装でも例外なく 1 回だけ要求する", async () => {
    const dom = createDom(() => undefined);
    disconnect = connectPointerLock(dom.target);
    dom.emit("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(dom.mock.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("すでにロック中ならクリックで再要求しない", () => {
    const dom = createDom();
    disconnect = connectPointerLock(dom.target);
    dom.setLock(true);
    dom.emit("click");
    expect(dom.mock.requestPointerLock).not.toHaveBeenCalled();
  });
});
