import {describe, expect, it, vi} from "vitest";

import {createItemManager} from "../../items/itemManager";
import {parseDirectoryData, type StockFile} from "../../objects/directory/data";
import {createObjectManager} from "../../objects/objectManager";
import type {InteractRequest} from "../../objects/types";
import {WORKSPACE_ACTION_MS} from "../../objects/workspace/data";
import {createDummyAuthority, DUMMY_ITEM_KIND} from "../dummyAuthority";

// ファイルの id は意味を持たない不透明な値(状態や色を混ぜない)。読みやすいよう定数にする
const F1 = "0a1b2c3d-0001-4000-8000-000000000001";
const F2 = "0a1b2c3d-0002-4000-8000-000000000002";
const F3 = "0a1b2c3d-0003-4000-8000-000000000003";
// 新規ファイルの id(newId の n 回目の値)
const newIdOf = (n: number) =>
  `0a1b2c3d-01${String(n).padStart(2, "0")}-4000-8000-000000000000`;

// マネージャーとダミーのサーバー役をつないだ、実際の配線と同じ形
const setup = (random?: () => number) => {
  // 時間は進めたときだけ進む。ワークスペースのアニメーション待ちを、テストで制御する
  let now = 0;
  // 新規ファイルの id は呼ぶたびに別の固定値(UUID 風)になる
  let newIdCount = 0;
  const timers: Array<{at: number; fn: () => void}> = [];
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };

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
    schedule: (fn, ms) => {
      timers.push({at: now + ms, fn});
    },
    newId: () => newIdOf(++newIdCount),
  });
  handle = authority.handle;
  return {objects, items, authority, requests, advance};
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
    const STOCK: StockFile[] = [
      {id: F1, color: "#e63946", status: "unedited"},
      {id: F2, color: "#1d6fe0", status: "edited"},
      {id: F3, color: "#2a9d5c", status: "unedited"},
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

        objects.interact(id, {target: F2});

        expect(data().stock.map((f) => f.id)).toEqual([F1, F3]);
        expect(items.getHeld()).toEqual({
          id: F2,
          kind: "file",
          data: {status: "edited", color: "#1d6fe0"},
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

        expect(authority.borrowAsOther(id)).toBe(F1);
        objects.interact(id, {target: F1});
        expect(rejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "not_found",
        });

        objects.interact(id, {target: F3});
        expect(items.getHeld()?.id).toBe(F3);
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
        objects.interact(id, {target: F1});
        expect(objects.getObject(id)?.users).toEqual([]);
      });
    });

    describe("ファイルを持って入れる", () => {
      it("編集した在庫のファイルは、編集済みとして在庫に戻り、達成が +1 される", () => {
        const {objects, items, authority, id, data} = setupDirectory();
        objects.interact(id, {target: F1});
        authority.editHeldFile();

        objects.interact(id);

        expect(items.getHeld()).toBeNull();
        expect(data().stock).toContainEqual({
          id: F1,
          color: "#e63946",
          status: "edited",
        });
        expect(data().stock).toHaveLength(3);
        expect(data().outputs).toBe(0);
        expect(authority.getAchieved()).toBe(1);
      });

      it("編集済みのファイルを取り出して入れ直しても、同じファイルの達成は増えない", () => {
        const {objects, authority, id} = setupDirectory();
        objects.interact(id, {target: F1});
        authority.editHeldFile();
        objects.interact(id);
        expect(authority.getAchieved()).toBe(1);

        objects.interact(id, {target: F1});
        objects.interact(id);

        expect(authority.getAchieved()).toBe(1);
      });

      it("編集していない在庫のファイルは、在庫に戻るだけで、達成には数えない", () => {
        const {objects, items, authority, id, data} = setupDirectory();
        objects.interact(id, {target: F1});

        objects.interact(id);

        expect(items.getHeld()).toBeNull();
        expect(data().stock).toContainEqual({
          id: F1,
          color: "#e63946",
          status: "unedited",
        });
        expect(data().outputs).toBe(0);
        expect(authority.getAchieved()).toBe(0);
      });

      it.each(["file_created", "search_created", "image_created"] as const)(
        "作成系(%s)のファイルは、成果物が +1 されるだけで、在庫は増えない",
        (status) => {
          const {objects, items, authority, id, data} = setupDirectory();
          authority.spawnNewFile(status);

          objects.interact(id);

          expect(items.getHeld()).toBeNull();
          expect(data().outputs).toBe(1);
          expect(data().stock).toEqual(STOCK);
          expect(authority.getAchieved()).toBe(0);
        },
      );

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

  describe("キャンバス", () => {
    it("interact は、実サーバーと同じく unavailable で拒否し、状態は変えない", () => {
      const {objects, authority} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnCanvas([0, 0, -3]);
      const before = objects.getState();

      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "unavailable",
      });
      expect(objects.getState()).toBe(before);
    });
  });

  describe("ワークスペース", () => {
    it("編集前のファイルを持って interact すると、2 秒後に同じ id・同じ color で edited になり、users が空に戻る", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      items.apply({
        type: "spawn",
        item: {
          id: F1,
          kind: "file",
          data: {status: "unedited", color: "#e63946"},
        },
      });

      objects.interact(id);

      // 受理した時点で作業中(結果はまだ)
      expect(objects.getObject(id)?.users).toEqual(["me"]);
      advance(WORKSPACE_ACTION_MS - 1);
      expect(items.getHeld()?.data).toEqual({
        status: "unedited",
        color: "#e63946",
      });
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      advance(1);
      expect(items.getHeld()).toEqual({
        id: F1,
        kind: "file",
        data: {status: "edited", color: "#e63946"},
      });
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("手ぶらで interact すると、2 秒後に新規ファイル(file_created・色なし・id は newId の値)を持ち、users が空に戻る", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);

      objects.interact(id);

      expect(objects.getObject(id)?.users).toEqual(["me"]);
      advance(WORKSPACE_ACTION_MS - 1);
      expect(items.getHeld()).toBeNull();

      advance(1);
      expect(items.getHeld()).toEqual({
        id: newIdOf(1),
        kind: "file",
        data: {status: "file_created"},
      });
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("新規ファイルの id は spawnNewFile と重ならず、newId で採番される", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      const first = authority.spawnNewFile();
      authority.deleteHeldItem();

      objects.interact(id);
      advance(WORKSPACE_ACTION_MS);

      expect(first).toBe(newIdOf(1));
      expect(items.getHeld()?.id).toBe(newIdOf(2));
    });

    it("newId を渡さなければ、crypto.randomUUID の UUID で採番される", () => {
      const items = createItemManager();
      const objects = createObjectManager({
        localPlayerId: "me",
        getHeldItem: () => null,
        send: () => {},
      });
      const authority = createDummyAuthority({
        localPlayerId: "me",
        objects,
        items,
      });

      const id = authority.spawnNewFile();

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(items.getHeld()?.id).toBe(id);
    });

    it.each([
      [
        "編集済みのファイル",
        {
          id: F1,
          kind: "file",
          data: {status: "edited", color: "#e63946"},
        },
      ],
      [
        "作成したファイル(file_created。作成したファイルは編集しない)",
        {id: F2, kind: "file", data: {status: "file_created"}},
      ],
      [
        "作成したファイル(search_created)",
        {id: F2, kind: "file", data: {status: "search_created"}},
      ],
      [
        "作成したファイル(image_created)",
        {id: F2, kind: "file", data: {status: "image_created"}},
      ],
      ["ファイル以外のアイテム", {id: "l", kind: "lighter", data: null}],
      [
        "status が読めないファイル",
        {id: F3, kind: "file", data: {status: "bogus"}},
      ],
    ])(
      "%sを持っていると missing_item で拒否し、アニメーションを始めない",
      (_, item) => {
        const {objects, items, authority, advance} = setup();
        const onRejected = vi.fn();
        objects.on("interactRejected", onRejected);
        const id = authority.spawnWorkspace([0, 0, -3]);
        items.apply({type: "spawn", item});

        objects.interact(id);

        expect(onRejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "missing_item",
        });
        expect(objects.getObject(id)?.users).toEqual([]);
        advance(WORKSPACE_ACTION_MS);
        expect(items.getHeld()).toEqual(item);
      },
    );

    it("作業中の再 interact は unavailable で拒否し、結果は 1 回だけ適用される", () => {
      const {objects, items, authority, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnWorkspace([0, 0, -3]);

      objects.interact(id);
      advance(500);
      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "unavailable",
      });
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      advance(WORKSPACE_ACTION_MS);
      expect(items.getHeld()?.data).toEqual({status: "file_created"});
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("作成したファイルを持ったまま続けて interact しても、編集はされず missing_item で拒否する", () => {
      const {objects, authority, items, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnWorkspace([0, 0, -3]);
      objects.interact(id);
      advance(WORKSPACE_ACTION_MS);
      expect(items.getHeld()?.data).toEqual({status: "file_created"});

      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "missing_item",
      });
      expect(objects.getObject(id)?.users).toEqual([]);
      advance(WORKSPACE_ACTION_MS);
      expect(items.getHeld()?.data).toEqual({status: "file_created"});
    });

    it("編集済みになったファイルは、もう編集できない", () => {
      const {objects, authority, items, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnWorkspace([0, 0, -3]);
      items.apply({
        type: "spawn",
        item: {
          id: F1,
          kind: "file",
          data: {status: "unedited", color: "#e63946"},
        },
      });
      objects.interact(id);
      advance(WORKSPACE_ACTION_MS);
      expect(items.getHeld()?.data).toMatchObject({status: "edited"});

      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "missing_item",
      });
    });

    it("2 秒の間に手持ちが変わっていたら、結果は適用せず users だけ外す(編集)", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      items.apply({
        type: "spawn",
        item: {id: F1, kind: "file", data: {status: "unedited"}},
      });
      objects.interact(id);

      authority.spawnItem("lighter");
      advance(WORKSPACE_ACTION_MS);

      expect(items.getHeld()?.kind).toBe("lighter");
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("2 秒の間に手持ちが変わっていたら、結果は適用せず users だけ外す(新規作成)", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      objects.interact(id);

      const lighter = authority.spawnItem("lighter");
      advance(WORKSPACE_ACTION_MS);

      expect(items.getHeld()?.id).toBe(lighter);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("2 秒の間に編集済みに変わっていたら、再度の編集はしない(同じ data のまま)", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      items.apply({
        type: "spawn",
        item: {id: F1, kind: "file", data: {status: "unedited"}},
      });
      objects.interact(id);

      authority.editHeldFile();
      const onSpawn = vi.fn();
      items.on("spawn", onSpawn);
      advance(WORKSPACE_ACTION_MS);

      expect(onSpawn).not.toHaveBeenCalled();
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("2 秒の間にワークスペースが消えたら、落ちずに結果は適用しない", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace([0, 0, -3]);
      objects.interact(id);

      authority.removeObject(id);

      expect(() => advance(WORKSPACE_ACTION_MS)).not.toThrow();
      expect(objects.getObject(id)).toBeUndefined();
      expect(items.getHeld()).toBeNull();
    });

    it("要求の手持ちの主張が実際の手持ちと食い違えば、missing_item で拒否する", () => {
      const {objects, authority, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnWorkspace([0, 0, -3]);

      authority.handle({
        type: "interact",
        objectId: id,
        by: "me",
        heldItem: {id: "fake", kind: "file"},
      });

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "missing_item",
      });
      expect(objects.getObject(id)?.users).toEqual([]);
      advance(WORKSPACE_ACTION_MS);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("owner 以外の interact は not_owner で拒否し、アニメーションを始めない", () => {
      const {objects, authority, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnWorkspace([0, 0, -3]);

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
      expect(objects.getObject(id)?.users).toEqual([]);
      advance(WORKSPACE_ACTION_MS);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("既定のタイマーは setTimeout(schedule を渡さなくても動く)", () => {
      vi.useFakeTimers();
      try {
        const items = createItemManager();
        const objects = createObjectManager({
          localPlayerId: "me",
          getHeldItem: () => null,
          send: (r) => authority.handle(r),
        });
        const authority = createDummyAuthority({
          localPlayerId: "me",
          objects,
          items,
        });
        const id = authority.spawnWorkspace([0, 0, -3]);

        objects.interact(id);
        vi.advanceTimersByTime(WORKSPACE_ACTION_MS - 1);
        expect(items.getHeld()).toBeNull();
        vi.advanceTimersByTime(1);

        expect(items.getHeld()?.kind).toBe("file");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
