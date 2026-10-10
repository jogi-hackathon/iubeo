import {describe, expect, it, vi} from "vitest";

import {createAuthorityRegistry} from "../registry";

const handle = (playerId: string) => ({
  playerId,
  kind: "local" as const,
  send: vi.fn(),
});

describe("createAuthorityRegistry", () => {
  it("登録が無ければ current は null", () => {
    expect(createAuthorityRegistry().current()).toBeNull();
  });

  it("後から登録した物が窓口になる", () => {
    const r = createAuthorityRegistry();
    r.register(handle("a"));
    r.register(handle("b"));
    expect(r.current()?.playerId).toBe("b");
  });

  it("外すと、その下にあった窓口に戻る(外した物が真ん中でも、先頭でも、窓口は末尾のまま)", () => {
    const r = createAuthorityRegistry();
    const offA = r.register(handle("a"));
    const offB = r.register(handle("b"));
    r.register(handle("c"));

    offB();
    expect(r.current()?.playerId).toBe("c");

    offA();
    expect(r.current()?.playerId).toBe("c");
  });

  it("末尾を外すと、一つ前の窓口に戻り、全部外すと null", () => {
    const r = createAuthorityRegistry();
    const offA = r.register(handle("a"));
    const offB = r.register(handle("b"));

    offB();
    expect(r.current()?.playerId).toBe("a");
    offA();
    expect(r.current()).toBeNull();
  });

  it("同じ登録を 2 回外しても、他の登録は消えない", () => {
    const r = createAuthorityRegistry();
    r.register(handle("a"));
    const offB = r.register(handle("b"));

    offB();
    offB();

    expect(r.current()?.playerId).toBe("a");
  });

  it("同じ参照を 2 回登録しても、外すのは片方ずつ", () => {
    const r = createAuthorityRegistry();
    const h = handle("a");
    const off1 = r.register(h);
    r.register(h);

    off1();

    expect(r.current()?.send).toBe(h.send);
    expect(r.current()).not.toBeNull();
  });

  it("窓口が変わったときだけ購読者に知らせる", () => {
    const r = createAuthorityRegistry();
    const listener = vi.fn();
    r.subscribe(listener);

    const off = r.register(handle("a"));
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
