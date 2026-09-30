import {describe, expect, it, vi} from "vitest";

import {createItemManager} from "../../items/itemManager";
import {parseDirectoryData} from "../../objects/directory/data";
import {createObjectManager} from "../../objects/objectManager";
import type {InteractRequest} from "../../objects/types";
import {createDummyAuthority, DUMMY_ITEM_KIND} from "../dummyAuthority";

// マネージャーとダミーのサーバー役をつないだ、実際の配線と同じ形
const setup = (random?: () => number) => {
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
    random,
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

  describe("ディレクトリ", () => {
    const STOCK = [
      {id: "f1", color: "#e63946", edited: false},
      {id: "f2", color: "#1d6fe0", edited: true},
      {id: "f3", color: "#2a9d5c", edited: false},
    ];

    const setupDirectory = (random?: () => number) => {
      const ctx = setup(random);
      const id = ctx.authority.spawnDirectory([3, 0, -3], STOCK);
      const data = () =>
        parseDirectoryData(ctx.objects.getObject(id)?.data ?? null);
      const rejected = vi.fn();
      ctx.objects.on("interactRejected", rejected);
      return {...ctx, id, data, rejected};
    };

    it("spawnDirectory は shared のディレクトリを置く(users は空、在庫は渡した分)", () => {
      const {objects, id, data} = setupDirectory();
      const object = objects.getObject(id);

      expect(object).toMatchObject({
        kind: "directory",
        scope: "shared",
        position: [3, 0, -3],
        users: [],
        availability: "available",
      });
      expect(data()).toEqual({stock: STOCK, outputs: 0});
    });

    describe("手ぶらで取り出す", () => {
      it("target が在庫にあれば、在庫から外れ、そのファイルが手に持たされる", () => {
        const {objects, items, id, data, rejected} = setupDirectory();

        objects.interact(id, {target: "f2"});

        expect(data().stock.map((f) => f.id)).toEqual(["f1", "f3"]);
        expect(items.getHeld()).toEqual({
          id: "f2",
          kind: "file",
          data: {origin: "stock", color: "#1d6fe0", edited: true},
        });
        expect(rejected).not.toHaveBeenCalled();
      });

      it("在庫に無い target は not_found で拒否し、何も変えない", () => {
        const {objects, items, id, rejected} = setupDirectory();
        const before = objects.getState();

        objects.interact(id, {target: "nothing"});

        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "not_found",
        });
        expect(objects.getState()).toBe(before);
        expect(items.getHeld()).toBeNull();
      });

      it("先着: 他の人に先に取られたファイルは、not_found になり、別のファイルは取れる", () => {
        const {objects, items, authority, id, rejected} = setupDirectory(
          () => 0,
        );

        expect(authority.borrowAsOther(id)).toBe("f1");
        objects.interact(id, {target: "f1"});
        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "not_found",
        });

        objects.interact(id, {target: "f3"});
        expect(items.getHeld()?.id).toBe("f3");
      });

      it("target が無ければ missing_item で拒否する", () => {
        const {objects, id, rejected} = setupDirectory();
        objects.interact(id);
        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "missing_item",
        });
      });

      it("ディレクトリの interact では、users の出し入れはしない", () => {
        const {objects, id} = setupDirectory();
        objects.interact(id, {target: "f1"});
        expect(objects.getObject(id)?.users).toEqual([]);
      });
    });

    describe("ファイルを持って入れる", () => {
      it("編集した在庫のファイルは、編集済みとして在庫に戻り、達成が +1 される", () => {
        const {objects, items, authority, id, data} = setupDirectory();
        objects.interact(id, {target: "f1"});
        authority.editHeldFile();

        objects.interact(id);

        expect(items.getHeld()).toBeNull();
        expect(data().stock).toContainEqual({
          id: "f1",
          color: "#e63946",
          edited: true,
        });
        expect(data().stock).toHaveLength(3);
        expect(data().outputs).toBe(0);
        expect(authority.getAchieved()).toBe(1);
      });

      it("編集していない在庫のファイルは、在庫に戻るだけで、達成には数えない", () => {
        const {objects, items, authority, id, data} = setupDirectory();
        objects.interact(id, {target: "f1"});

        objects.interact(id);

        expect(items.getHeld()).toBeNull();
        expect(data().stock).toContainEqual({
          id: "f1",
          color: "#e63946",
          edited: false,
        });
        expect(data().outputs).toBe(0);
        expect(authority.getAchieved()).toBe(0);
      });

      it("新しく作ったファイルは、成果物が +1 されるだけで、在庫は増えない", () => {
        const {objects, items, authority, id, data} = setupDirectory();
        authority.spawnNewFile("write");

        objects.interact(id);

        expect(items.getHeld()).toBeNull();
        expect(data().outputs).toBe(1);
        expect(data().stock).toEqual(STOCK);
        expect(authority.getAchieved()).toBe(0);
      });

      it("Web Search や Image Generation 由来の新規ファイルも成果物になる", () => {
        const {objects, authority, id, data} = setupDirectory();
        authority.spawnNewFile("web_search");
        objects.interact(id);
        authority.spawnNewFile("image_generation");
        objects.interact(id);
        expect(data().outputs).toBe(2);
      });

      it("ファイル以外を持っていれば missing_item で拒否し、手持ちも状態も変えない", () => {
        const {objects, items, authority, id, rejected} = setupDirectory();
        const lighter = authority.spawnItem("lighter");
        const before = objects.getState();

        objects.interact(id);

        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "missing_item",
        });
        expect(objects.getState()).toBe(before);
        expect(items.getHeld()?.id).toBe(lighter);
      });

      it("data の読めないファイルを持っていても missing_item で拒否する", () => {
        const {objects, authority, id, rejected} = setupDirectory();
        authority.spawnItem("file");

        objects.interact(id);

        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "missing_item",
        });
      });
    });

    describe("他のプレイヤーの貸し借り", () => {
      it("borrowAsOther は在庫からランダムに 1 つ外し、returnAsOther で戻す", () => {
        const {authority, id, data} = setupDirectory(() => 0.5);

        expect(authority.borrowAsOther(id)).toBe("f2");
        expect(data().stock.map((f) => f.id)).toEqual(["f1", "f3"]);
        expect(authority.getBorrowedCount()).toBe(1);

        expect(authority.returnAsOther(id)).toBe("f2");
        expect(data().stock.map((f) => f.id)).toEqual(["f1", "f3", "f2"]);
        expect(authority.getBorrowedCount()).toBe(0);
      });

      it("借りたファイルは、返されるまで自分は取れない", () => {
        const {objects, items, authority, id, rejected} = setupDirectory(
          () => 0,
        );
        authority.borrowAsOther(id);

        objects.interact(id, {target: "f1"});
        expect(items.getHeld()).toBeNull();
        expect(rejected).toHaveBeenCalledTimes(1);

        authority.returnAsOther(id);
        objects.interact(id, {target: "f1"});
        expect(items.getHeld()?.id).toBe("f1");
      });

      it("在庫が空、または借りた物が無ければ null", () => {
        const {objects, authority, id} = setupDirectory();
        expect(authority.returnAsOther(id)).toBeNull();

        // 1 つずつ取って、手元から捨てる(手は 1 つなので、持ったままでは次を取れない)
        for (const f of STOCK) {
          objects.interact(id, {target: f.id});
          authority.deleteHeldItem();
        }
        expect(authority.borrowAsOther(id)).toBeNull();
        expect(authority.borrowAsOther("nothing")).toBeNull();
      });
    });

    describe("ファイルの操作", () => {
      it("editHeldFile は同じ id のまま edited を立て、delete は通知しない", () => {
        const {items, authority} = setup();
        const onDelete = vi.fn();
        items.on("delete", onDelete);
        const id = authority.spawnNewFile("write");

        expect(authority.editHeldFile()).toBe(true);

        expect(items.getHeld()).toEqual({
          id,
          kind: "file",
          data: {origin: "write", edited: true},
        });
        expect(onDelete).not.toHaveBeenCalled();
      });

      it("ファイルを持っていなければ editHeldFile は false", () => {
        const {authority} = setup();
        expect(authority.editHeldFile()).toBe(false);
        authority.spawnItem("lighter");
        expect(authority.editHeldFile()).toBe(false);
      });
    });
  });
});
