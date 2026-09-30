import {afterEach, describe, expect, it, vi} from "vitest";

import {createObjectManager, type ObjectManagerOptions} from "../objectManager";
import type {GameObject, HeldItemRef, InteractRequest} from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

const object = (
  id: string,
  overrides: Partial<GameObject> = {},
): GameObject => ({
  id,
  kind: "dummy",
  scope: "personal",
  position: [0, 1, -3],
  users: [],
  availability: "available",
  data: null,
  ...overrides,
});

const make = (options: Partial<ObjectManagerOptions> = {}) => {
  const send = vi.fn<(r: InteractRequest) => void>();
  const manager = createObjectManager({
    localPlayerId: "me",
    getHeldItem: () => null,
    send,
    ...options,
  });
  return {manager, send};
};

describe("createObjectManager", () => {
  it("初期状態はオブジェクトなし", () => {
    expect(make().manager.getState()).toEqual({objects: []});
  });

  describe("apply", () => {
    it("upsert で追加し、同じ id なら置き換える。そのたびに subscribe へ通知する", () => {
      const {manager} = make();
      const onChange = vi.fn();
      manager.subscribe(onChange);

      manager.apply({type: "upsert", object: object("a")});
      manager.apply({type: "upsert", object: object("b")});
      manager.apply({
        type: "upsert",
        object: object("a", {availability: "unavailable"}),
      });

      expect(manager.getState().objects.map((o) => o.id)).toEqual(["a", "b"]);
      expect(manager.getObject("a")?.availability).toBe("unavailable");
      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it("変更のたびに state の参照が変わる", () => {
      const {manager} = make();
      const before = manager.getState();
      manager.apply({type: "upsert", object: object("a")});
      expect(manager.getState()).not.toBe(before);
    });

    it("remove で消す。存在しない id は無視して通知しない", () => {
      const {manager} = make();
      manager.apply({type: "upsert", object: object("a")});
      const onChange = vi.fn();
      manager.subscribe(onChange);

      manager.apply({type: "remove", id: "nothing"});
      expect(onChange).not.toHaveBeenCalled();

      manager.apply({type: "remove", id: "a"});
      expect(manager.getObject("a")).toBeUndefined();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("interactRejected は状態を変えず、理由付きで通知する", () => {
      const {manager} = make();
      const onRejected = vi.fn();
      const onChange = vi.fn();
      manager.on("interactRejected", onRejected);
      manager.subscribe(onChange);
      const before = manager.getState();

      manager.apply({
        type: "interactRejected",
        objectId: "a",
        reason: "unavailable",
      });

      expect(onRejected).toHaveBeenCalledWith({
        objectId: "a",
        reason: "unavailable",
      });
      expect(manager.getState()).toBe(before);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("interact", () => {
    it("要求を送る。状態は直接変えない", () => {
      const {manager, send} = make();
      manager.apply({type: "upsert", object: object("a")});
      const before = manager.getState();

      expect(manager.interact("a")).toBe(true);

      expect(send).toHaveBeenCalledWith({
        type: "interact",
        objectId: "a",
        by: "me",
        heldItem: null,
      });
      expect(manager.getState()).toBe(before);
    });

    it("要求のたびに、そのときの手持ちを渡す", () => {
      let held: HeldItemRef = null;
      const {manager, send} = make({getHeldItem: () => held});
      manager.apply({type: "upsert", object: object("a")});

      manager.interact("a");
      held = {id: "file-1", kind: "file"};
      manager.interact("a");

      expect(send.mock.calls.map(([r]) => r.heldItem)).toEqual([
        null,
        {id: "file-1", kind: "file"},
      ]);
    });

    it("target を渡すと要求に載り、渡さなければ target のキー自体が無い", () => {
      const {manager, send} = make();
      manager.apply({type: "upsert", object: object("a")});

      manager.interact("a", {target: "file-3"});
      manager.interact("a", {});
      manager.interact("a");

      const [withTarget, empty, none] = send.mock.calls.map(([r]) => r);
      expect(withTarget?.target).toBe("file-3");
      expect(empty).not.toHaveProperty("target");
      expect(none).not.toHaveProperty("target");
    });

    it("手元に無いオブジェクトは送らず false を返す", () => {
      const {manager, send} = make();
      expect(manager.interact("nothing")).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it("使用不可でも、要求は送る(通るかどうかはサーバーが決める)", () => {
      const {manager, send} = make();
      manager.apply({
        type: "upsert",
        object: object("a", {availability: "unavailable"}),
      });
      expect(manager.interact("a")).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("コールバック", () => {
    it("解除関数で on / subscribe を外せる", () => {
      const {manager} = make();
      const onRejected = vi.fn();
      const onChange = vi.fn();
      const offRejected = manager.on("interactRejected", onRejected);
      const offChange = manager.subscribe(onChange);
      offRejected();
      offChange();

      manager.apply({type: "upsert", object: object("a")});
      manager.apply({
        type: "interactRejected",
        objectId: "a",
        reason: "too_far",
      });
      expect(onRejected).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("例外を投げるコールバックがあっても状態更新と他のコールバックは続く", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const {manager} = make();
      const ok = vi.fn();
      manager.subscribe(() => {
        throw new Error("boom");
      });
      manager.subscribe(ok);
      manager.on("interactRejected", () => {
        throw new Error("boom");
      });
      manager.on("interactRejected", ok);

      manager.apply({type: "upsert", object: object("a")});
      manager.apply({
        type: "interactRejected",
        objectId: "a",
        reason: "not_found",
      });

      expect(manager.getObject("a")).toBeDefined();
      expect(ok).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledTimes(2);
    });
  });
});
