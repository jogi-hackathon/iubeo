import {afterEach, describe, expect, it, vi} from "vitest";

import {createItemManager} from "../itemManager";
import type {Item} from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

const item = (id: string, kind = "dummy_item"): Item => ({
  id,
  kind,
  data: null,
});

describe("createItemManager", () => {
  it("初期状態は何も持っていない", () => {
    const m = createItemManager();
    expect(m.getState()).toEqual({held: null});
    expect(m.getHeld()).toBeNull();
  });

  describe("spawn", () => {
    it("手に持たせ、spawn と subscribe を通知する", () => {
      const m = createItemManager();
      const onSpawn = vi.fn();
      const onChange = vi.fn();
      m.on("spawn", onSpawn);
      m.subscribe(onChange);
      const before = m.getState();

      m.apply({type: "spawn", item: item("a")});

      expect(m.getHeld()).toEqual(item("a"));
      expect(m.getState()).not.toBe(before);
      expect(onSpawn).toHaveBeenCalledWith({item: item("a")});
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("既に持っていたら置き換わり、持っていた物は delete として通知する", () => {
      const m = createItemManager();
      const seen: string[] = [];
      m.apply({type: "spawn", item: item("file-1", "file")});
      m.on("delete", ({item: i}) => seen.push(`delete:${i.id}`));
      m.on("spawn", ({item: i}) => seen.push(`spawn:${i.id}`));

      m.apply({type: "spawn", item: item("lighter-1", "lighter")});

      expect(m.getHeld()?.id).toBe("lighter-1");
      expect(seen).toEqual(["delete:file-1", "spawn:lighter-1"]);
    });

    it("持っているのと同じ id の spawn は data の更新で、delete は通知しない", () => {
      const m = createItemManager();
      m.apply({type: "spawn", item: item("a")});
      const onDelete = vi.fn();
      const onSpawn = vi.fn();
      m.on("delete", onDelete);
      m.on("spawn", onSpawn);

      m.apply({type: "spawn", item: {...item("a"), data: {edited: true}}});

      expect(m.getHeld()?.data).toEqual({edited: true});
      expect(onDelete).not.toHaveBeenCalled();
      expect(onSpawn).toHaveBeenCalledTimes(1);
    });

    it("置き換わっても、subscribe の通知は 1 回だけ", () => {
      const m = createItemManager();
      m.apply({type: "spawn", item: item("a")});
      const onChange = vi.fn();
      m.subscribe(onChange);

      m.apply({type: "spawn", item: item("b")});

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete", () => {
    it("持っている物を消し、delete を通知する", () => {
      const m = createItemManager();
      const onDelete = vi.fn();
      m.apply({type: "spawn", item: item("a")});
      m.on("delete", onDelete);

      m.apply({type: "delete", id: "a"});

      expect(m.getHeld()).toBeNull();
      expect(onDelete).toHaveBeenCalledWith({item: item("a")});
    });

    it("持っていない id は無視して通知しない", () => {
      const m = createItemManager();
      m.apply({type: "spawn", item: item("a")});
      const onDelete = vi.fn();
      const onChange = vi.fn();
      m.on("delete", onDelete);
      m.subscribe(onChange);
      const before = m.getState();

      m.apply({type: "delete", id: "other"});

      expect(m.getState()).toBe(before);
      expect(onDelete).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("何も持っていないときの delete も無視する", () => {
      const m = createItemManager();
      const onChange = vi.fn();
      m.subscribe(onChange);
      m.apply({type: "delete", id: "a"});
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("コールバック", () => {
    it("解除関数で on / subscribe を外せる", () => {
      const m = createItemManager();
      const onSpawn = vi.fn();
      const onChange = vi.fn();
      m.on("spawn", onSpawn)();
      m.subscribe(onChange)();

      m.apply({type: "spawn", item: item("a")});

      expect(onSpawn).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("例外を投げるコールバックがあっても状態更新と他のコールバックは続く", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const m = createItemManager();
      const ok = vi.fn();
      m.subscribe(() => {
        throw new Error("boom");
      });
      m.subscribe(ok);
      m.on("spawn", () => {
        throw new Error("boom");
      });
      m.on("spawn", ok);

      m.apply({type: "spawn", item: item("a")});

      expect(m.getHeld()?.id).toBe("a");
      expect(ok).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledTimes(2);
    });
  });
});
