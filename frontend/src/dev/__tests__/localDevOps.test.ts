import {afterEach, describe, expect, it, vi} from "vitest";

import {applyMessage} from "../../authority/apply";
import {createLocalRules, DUMMY_ITEM_KIND} from "../../authority/local/rules";
import {authorityRegistry} from "../../authority/registry";
import {createItemManager} from "../../items/itemManager";
import {
  DIRECTORY_KIND,
  parseDirectoryData,
  type StockFile,
} from "../../objects/directory/data";
import {createObjectManager} from "../../objects/objectManager";
import {TEST_SPARE_IDS} from "../../scenes/TestScene/layout";
import {getLocalDevOps} from "../localDevOps";

const F1 = "0a1b2c3d-0001-4000-8000-000000000001";
const F2 = "0a1b2c3d-0002-4000-8000-000000000002";
const F3 = "0a1b2c3d-0003-4000-8000-000000000003";

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
});

const setup = (random?: () => number) => {
  const items = createItemManager();
  const objects = createObjectManager({
    getHeldItem: () => {
      const held = items.getHeld();
      return held && {id: held.id, kind: held.kind};
    },
    getAuthority: () => ({
      playerId: "me",
      kind: "local",
      send: (r) => rules.handle(r),
    }),
  });
  const rules = createLocalRules({
    playerId: "me",
    objects,
    deliver: (message) =>
      applyMessage({objects, items, myPlayerId: () => "me"}, message),
  });
  unregister = authorityRegistry.register({
    playerId: "me",
    kind: "local",
    send: rules.handle,
    dev: rules.dev,
  });

  const ops = getLocalDevOps();
  if (!ops) {
    throw new Error("テストの窓口に dev が無い");
  }
  const authority = {
    ...ops,
    borrowAsOther: (directoryId: string) =>
      ops.borrowAsOther(directoryId, random),
  };
  return {objects, items, authority, rules, deliver: rules.dev.deliver};
};

describe("localDevOps", () => {
  describe("窓口の有無", () => {
    it("窓口が無ければ null", () => {
      expect(getLocalDevOps()).toBeNull();
    });

    it("窓口があっても dev が無ければ null(サーバーの窓口など)", () => {
      unregister = authorityRegistry.register({
        playerId: "me",
        kind: "server",
        send: () => {},
      });
      expect(getLocalDevOps()).toBeNull();
    });

    it("窓口が外れると、借りた状態も一緒に捨てられる", () => {
      const {objects, authority, deliver} = setup(() => 0);
      deliver({
        type: "object.upsert",
        object: {
          id: "directory-1",
          kind: DIRECTORY_KIND,
          scope: "shared",
          users: [],
          availability: "available",
          data: {
            stock: [{id: F1, color: "#e63946", status: "unedited"}],
            outputs: 0,
          },
        },
      });
      expect(authority.borrowAsOther("directory-1")).toBe(F1);
      expect(authority.getBorrowedCount()).toBe(1);
      expect(objects.getObject("directory-1")).toBeDefined();

      unregister?.();
      unregister = undefined;
      const next = setup();
      expect(next.authority.getBorrowedCount()).toBe(0);
    });
  });

  describe("spawnSpareObject", () => {
    it("scope に応じて owner を付け、空いている id を順に使う", () => {
      const {objects, authority} = setup();
      const a = authority.spawnSpareObject("personal");
      const b = authority.spawnSpareObject("shared");

      expect(a).toBe(TEST_SPARE_IDS[0]);
      expect(b).toBe(TEST_SPARE_IDS[1]);
      expect(objects.getObject(a ?? "")?.owner).toBe("me");
      expect(objects.getObject(b ?? "")).not.toHaveProperty("owner");
    });

    it("全部使われていれば undefined", () => {
      const {authority} = setup();
      const ids = TEST_SPARE_IDS.map(() =>
        authority.spawnSpareObject("shared"),
      );
      expect(ids.every((id) => id !== undefined)).toBe(true);
      expect(authority.spawnSpareObject("shared")).toBeUndefined();
    });
  });

  describe("オブジェクトの操作", () => {
    it("setAvailability で切り替え、removeObject で消す", () => {
      const {objects, authority} = setup();
      const id = authority.spawnSpareObject("personal") ?? "";

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

  describe("ディレクトリの操作", () => {
    const STOCK: StockFile[] = [
      {id: F1, color: "#e63946", status: "unedited"},
      {id: F2, color: "#1d6fe0", status: "edited"},
      {id: F3, color: "#2a9d5c", status: "unedited"},
    ];

    const setupDirectory = (random?: () => number) => {
      const ctx = setup(random);
      const id = "directory-1";
      ctx.deliver({
        type: "object.upsert",
        object: {
          id,
          kind: DIRECTORY_KIND,
          scope: "shared",
          users: [],
          availability: "available",
          data: {stock: STOCK.map((f) => ({...f})), outputs: 0},
        },
      });
      const data = () =>
        parseDirectoryData(ctx.objects.getObject(id)?.data ?? null);
      const rejected = vi.fn();
      ctx.objects.on("interactRejected", rejected);
      return {...ctx, id, data, rejected};
    };

    describe("他のプレイヤーの貸し借り", () => {
      it("borrowAsOther は在庫からランダムに 1 つ外し、returnAsOther で戻す", () => {
        const {authority, id, data} = setupDirectory(() => 0.5);

        expect(authority.borrowAsOther(id)).toBe(F2);
        expect(data().stock.map((f) => f.id)).toEqual([F1, F3]);
        expect(authority.getBorrowedCount()).toBe(1);

        expect(authority.returnAsOther(id)).toBe(F2);
        expect(data().stock.map((f) => f.id)).toEqual([F1, F3, F2]);
        expect(authority.getBorrowedCount()).toBe(0);
      });

      it("借りたファイルは、返されるまで自分は取れない", () => {
        const {objects, items, authority, id, rejected} = setupDirectory(
          () => 0,
        );
        authority.borrowAsOther(id);

        objects.interact(id, {target: F1});
        expect(items.getHeld()).toBeNull();
        expect(rejected).toHaveBeenCalledTimes(1);

        authority.returnAsOther(id);
        objects.interact(id, {target: F1});
        expect(items.getHeld()?.id).toBe(F1);
      });

      it("在庫が空、または借りた物が無ければ null", () => {
        const {objects, authority, id} = setupDirectory();
        expect(authority.returnAsOther(id)).toBeNull();

        for (const f of STOCK) {
          objects.interact(id, {target: f.id});
          authority.deleteHeldItem();
        }
        expect(authority.borrowAsOther(id)).toBeNull();
        expect(authority.borrowAsOther("nothing")).toBeNull();
      });
    });

    describe("ファイルの操作", () => {
      it("editHeldFile は同じ id・同じ color のまま status を edited にし、delete は通知しない", () => {
        const {objects, items, authority, id} = setupDirectory();
        const onDelete = vi.fn();
        items.on("delete", onDelete);
        objects.interact(id, {target: F1});

        expect(authority.editHeldFile()).toBe(true);

        expect(items.getHeld()).toEqual({
          id: F1,
          kind: "file",
          data: {status: "edited", color: "#e63946"},
        });
        expect(onDelete).not.toHaveBeenCalled();
      });

      it("作成したファイルは editHeldFile で編集できない", () => {
        const {items, authority} = setup();
        authority.spawnNewFile();

        expect(authority.editHeldFile()).toBe(false);
        expect(items.getHeld()?.data).toEqual({status: "file_created"});
      });

      it("ファイルを持っていなければ editHeldFile は false", () => {
        const {authority} = setup();
        expect(authority.editHeldFile()).toBe(false);
        authority.spawnItem("lighter");
        expect(authority.editHeldFile()).toBe(false);
      });
    });
  });

  describe("勝利フラグ", () => {
    it("toggleTeamFlag で 1 つずつ切り替える。bypassPermission は置き場の使える・使えないも連動する", () => {
      const {objects, authority, rules} = setup();
      rules.dev.deliver({
        type: "object.upsert",
        object: {
          id: "lighter_stand-1",
          kind: "lighter_stand",
          scope: "personal",
          owner: "me",
          users: [],
          availability: "unavailable",
          data: {hasLighter: true},
        },
      });

      authority.toggleTeamFlag("bypassPermission");
      expect(rules.dev.getTeam()).toEqual({
        bypassPermission: true,
        fireStarted: false,
      });
      expect(objects.getObject("lighter_stand-1")?.availability).toBe(
        "available",
      );

      authority.toggleTeamFlag("fireStarted");
      authority.toggleTeamFlag("bypassPermission");
      expect(rules.dev.getTeam()).toEqual({
        bypassPermission: false,
        fireStarted: true,
      });
      expect(objects.getObject("lighter_stand-1")?.availability).toBe(
        "unavailable",
      );
    });
  });
});
