import {describe, expect, it, vi} from "vitest";

import {createItemManager} from "../../items/itemManager";
import {createObjectManager} from "../../objects/objectManager";
import type {InteractRequest} from "../../objects/types";
import {createDummyAuthority, DUMMY_ITEM_KIND} from "../dummyAuthority";

// マネージャーとダミーのサーバー役をつないだ、実際の配線と同じ形
const setup = () => {
  const items = createItemManager();
  const requests: InteractRequest[] = [];
  let handle: (r: InteractRequest) => void = () => {};
  const objects = createObjectManager({
    localPlayerId: "me",
    getHeldItem: () => {
      const held = items.getHeld();
      return held && {id: held.id, kind: held.kind};
    },
    send: (r) => {
      requests.push(r);
      handle(r);
    },
  });
  const authority = createDummyAuthority({
    localPlayerId: "me",
    objects,
    items,
  });
  handle = authority.handle;
  return {objects, items, authority, requests};
};

describe("createDummyAuthority", () => {
  describe("interact の要求", () => {
    it("personal は本人が users に入り、もう一度で出る", () => {
      const {objects, authority} = setup();
      const id = authority.spawnObject([0, 1, -3], "personal");

      objects.interact(id);
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      objects.interact(id);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("shared は複数人が同時に users に入れる", () => {
      const {objects, authority} = setup();
      const id = authority.spawnObject([0, 1, -3], "shared");

      authority.handle({
        type: "interact",
        objectId: id,
        by: "other",
        heldItem: null,
      });
      objects.interact(id);

      expect(objects.getObject(id)?.users).toEqual(["other", "me"]);
    });

    it("personal を owner 以外が触ると not_owner で拒否し、状態は変えない", () => {
      const {objects, authority} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnObject([0, 1, -3], "personal");
      const before = objects.getState();

      authority.handle({
        type: "interact",
        objectId: id,
        by: "other",
        heldItem: null,
      });

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "not_owner",
      });
      expect(objects.getState()).toBe(before);
    });

    it("使用不可なら unavailable で拒否し、状態は変えない", () => {
      const {objects, authority} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnObject([0, 1, -3], "personal", "unavailable");
      const before = objects.getState();

      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "unavailable",
      });
      expect(objects.getState()).toBe(before);
    });

    it("サーバー側に無いオブジェクトは not_found で拒否する", () => {
      const {objects, authority} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);

      authority.handle({
        type: "interact",
        objectId: "nothing",
        by: "me",
        heldItem: null,
      });

      expect(onRejected).toHaveBeenCalledWith({
        objectId: "nothing",
        reason: "not_found",
      });
    });

    it("手持ちがあれば、要求に載って届く", () => {
      const {objects, authority, requests} = setup();
      const id = authority.spawnObject([0, 1, -3], "personal");
      const itemId = authority.spawnItem("file");

      objects.interact(id);

      expect(requests[0]?.heldItem).toEqual({id: itemId, kind: "file"});
    });
  });

  describe("オブジェクトの操作", () => {
    it("spawnObject は scope に応じて owner を付け、id を返す", () => {
      const {objects, authority} = setup();
      const a = authority.spawnObject([0, 0, 0], "personal");
      const b = authority.spawnObject([0, 0, 0], "shared");

      expect(a).not.toBe(b);
      expect(objects.getObject(a)?.owner).toBe("me");
      expect(objects.getObject(b)).not.toHaveProperty("owner");
    });

    it("setAvailability で切り替え、removeObject で消す", () => {
      const {objects, authority} = setup();
      const id = authority.spawnObject([0, 0, 0]);

      authority.setAvailability(id, "unavailable");
      expect(objects.getObject(id)?.availability).toBe("unavailable");

      authority.removeObject(id);
      expect(objects.getObject(id)).toBeUndefined();
    });

    it("存在しない id の setAvailability は無視する", () => {
      const {objects, authority} = setup();
      authority.setAvailability("nothing", "unavailable");
      expect(objects.getState().objects).toEqual([]);
    });
  });

  describe("アイテムの操作", () => {
    it("spawnItem で手に持たせ、deleteHeldItem で消す", () => {
      const {items, authority} = setup();

      const id = authority.spawnItem();
      expect(items.getHeld()).toEqual({id, kind: DUMMY_ITEM_KIND, data: null});

      authority.deleteHeldItem();
      expect(items.getHeld()).toBeNull();
    });

    it("持ったまま spawnItem すると置き換わる", () => {
      const {items, authority} = setup();
      authority.spawnItem("file");
      const lighter = authority.spawnItem("lighter");
      expect(items.getHeld()?.id).toBe(lighter);
    });

    it("何も持っていないときの deleteHeldItem は何も起こさない", () => {
      const {items, authority} = setup();
      authority.deleteHeldItem();
      expect(items.getHeld()).toBeNull();
    });
  });
});
