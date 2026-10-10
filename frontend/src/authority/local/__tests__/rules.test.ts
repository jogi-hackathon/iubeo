import {describe, expect, it, vi} from "vitest";

import {FILE_KIND, parseFileData} from "../../../items";
import {createItemManager} from "../../../items/itemManager";
import {CANVAS_ACTION_MS, CANVAS_KIND} from "../../../objects/canvas/data";
import {
  DIRECTORY_KIND,
  parseDirectoryData,
  type StockFile,
} from "../../../objects/directory/data";
import {kindOfId} from "../../../objects/layout";
import {LIGHTER_STAND_KIND} from "../../../objects/lighter_stand/data";
import {createObjectManager} from "../../../objects/objectManager";
import {PC_KIND} from "../../../objects/pc/data";
import type {
  GameObject,
  InteractRequest,
  ObjectScope,
} from "../../../objects/types";
import {
  WORKSPACE_ACTION_MS,
  WORKSPACE_KIND,
} from "../../../objects/workspace/data";
import {applyMessage} from "../../apply";
import {createTeamStore} from "../../team";
import {createLocalRules, DUMMY_ITEM_KIND} from "../rules";

const F1 = "0a1b2c3d-0001-4000-8000-000000000001";
const F2 = "0a1b2c3d-0002-4000-8000-000000000002";
const F3 = "0a1b2c3d-0003-4000-8000-000000000003";
const newIdOf = (n: number) =>
  `0a1b2c3d-01${String(n).padStart(2, "0")}-4000-8000-000000000000`;

const setup = () => {
  let now = 0;
  let newIdCount = 0;
  let itemCount = 0;
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
    getHeldItem: () => {
      const held = items.getHeld();
      return held && {id: held.id, kind: held.kind};
    },
    getAuthority: () => ({
      playerId: "me",
      kind: "local",
      send: (r) => {
        requests.push(r);
        handle(r);
      },
    }),
  });
  const team = createTeamStore();
  const rules = createLocalRules({
    playerId: "me",
    objects,
    deliver: (message) =>
      applyMessage({objects, items, myPlayerId: () => "me", team}, message),
    schedule: (fn, ms) => {
      const timer = {at: now + ms, fn};
      timers.push(timer);
      return () => {
        const i = timers.indexOf(timer);
        if (i >= 0) {
          timers.splice(i, 1);
        }
      };
    },
    newId: () => newIdOf(++newIdCount),
  });
  handle = rules.handle;

  const put = (object: GameObject) => {
    rules.dev.deliver({type: "object.upsert", object});
    return object.id;
  };
  const authority = {
    ...rules,
    spawnObject: (
      id: string,
      scope: ObjectScope = "personal",
      availability: GameObject["availability"] = "available",
    ): string =>
      put({
        id,
        kind: kindOfId(id),
        scope,
        ...(scope === "personal" && {owner: "me"}),
        users: [],
        availability,
        data: null,
      }),
    spawnDirectory: (id: string, stock: readonly StockFile[]): string =>
      put({
        id,
        kind: DIRECTORY_KIND,
        scope: "shared",
        users: [],
        availability: "available",
        data: {stock: stock.map((f) => ({...f})), outputs: 0},
      }),
    spawnWorkspace: (id: string): string =>
      put({
        id,
        kind: WORKSPACE_KIND,
        scope: "personal",
        owner: "me",
        users: [],
        availability: "available",
        data: null,
      }),
    spawnCanvas: (id: string): string =>
      put({
        id,
        kind: CANVAS_KIND,
        scope: "personal",
        owner: "me",
        users: [],
        availability: "available",
        data: null,
      }),
    spawnLighterStand: (id: string): string =>
      put({
        id,
        kind: LIGHTER_STAND_KIND,
        scope: "personal",
        owner: "me",
        users: [],
        availability: "unavailable",
        data: {hasLighter: true},
      }),
    spawnPc: (id: string): string =>
      put({
        id,
        kind: PC_KIND,
        scope: "personal",
        owner: "me",
        users: [],
        availability: "available",
        data: null,
      }),
    spawnItem: (kind: string = DUMMY_ITEM_KIND): string => {
      const id = `${kind}-${++itemCount}`;
      rules.dev.setHeldItem({id, kind, data: null});
      return id;
    },
    spawnNewFile: (
      status:
        | "file_created"
        | "image_created"
        | "search_created" = "file_created",
    ): string => {
      const id = newIdOf(++newIdCount);
      rules.dev.setHeldItem({id, kind: FILE_KIND, data: {status}});
      return id;
    },
    deleteHeldItem: (): void => {
      rules.dev.setHeldItem(null);
    },
    editHeldFile: (): boolean => {
      const held = rules.dev.getHeldItem();
      const file =
        held && held.kind === FILE_KIND ? parseFileData(held.data) : null;
      if (
        !held ||
        !file ||
        file.status === "file_created" ||
        file.status === "search_created" ||
        file.status === "image_created"
      ) {
        return false;
      }
      rules.dev.setHeldItem({...held, data: {...file, status: "edited"}});
      return true;
    },
    lendAway: (directoryId: string, fileId: string): void => {
      const object = rules.dev.getObject(directoryId);
      if (!object) {
        return;
      }
      const data = parseDirectoryData(object.data);
      put({
        ...object,
        data: {...data, stock: data.stock.filter((f) => f.id !== fileId)},
      });
    },
    getAchieved: (): number => rules.dev.getAchieved(),
    removeObject: (id: string): void => {
      rules.dev.deliver({type: "object.remove", id});
    },
  };
  return {objects, items, team, authority, requests, advance};
};

describe("createLocalRules", () => {
  describe("interact の要求", () => {
    it("personal は本人が users に入り、もう一度で出る", () => {
      const {objects, authority} = setup();
      const id = authority.spawnObject("dummy-1", "personal");

      objects.interact(id);
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      objects.interact(id);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("shared は複数人が同時に users に入れる", () => {
      const {objects, authority} = setup();
      const id = authority.spawnObject("dummy-1", "shared");

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
      const id = authority.spawnObject("dummy-1", "personal");
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
      const id = authority.spawnObject("dummy-1", "personal", "unavailable");
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
      const id = authority.spawnObject("dummy-1", "personal");
      const itemId = authority.spawnItem("file");

      objects.interact(id);

      expect(requests[0]?.heldItem).toEqual({id: itemId, kind: "file"});
    });
  });

  describe("ディレクトリ", () => {
    const STOCK: StockFile[] = [
      {id: F1, color: "#e63946", status: "unedited"},
      {id: F2, color: "#1d6fe0", status: "edited"},
      {id: F3, color: "#2a9d5c", status: "unedited"},
    ];

    const setupDirectory = () => {
      const ctx = setup();
      const id = ctx.authority.spawnDirectory("directory-1", STOCK);
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
        users: [],
        availability: "available",
      });
      expect(data()).toEqual({stock: STOCK, outputs: 0});
    });

    it("data に山の大きさは入らない(置き場所のレイアウトが決める)。在庫の出し入れでも data は在庫だけ変わる", () => {
      const {authority, objects, items} = setup();
      const id = authority.spawnDirectory("directory-1", STOCK);
      const data = () =>
        parseDirectoryData(objects.getObject(id)?.data ?? null);
      expect(objects.getObject(id)?.data).not.toHaveProperty("size");

      objects.interact(id, {target: F2});
      expect(items.getHeld()?.id).toBe(F2);
      expect(data().stock.map((f) => f.id)).toEqual([F1, F3]);
      expect(objects.getObject(id)?.data).not.toHaveProperty("size");
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
        const {objects, items, authority, id, rejected} = setupDirectory();

        authority.lendAway(id, F1);
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
  });

  describe("片付け(release)", () => {
    it("規則が置いた物だけを片付け、手持ちも空にする(規則の外から置かれた物は残す)", () => {
      const {objects, items, authority} = setup();
      authority.spawnWorkspace("workspace-1");
      authority.spawnItem("file");
      objects.apply({
        type: "upsert",
        object: {
          id: "outside-1",
          kind: "dummy",
          scope: "shared",
          users: [],
          availability: "available",
          data: null,
        },
      });

      authority.release();

      expect(objects.getState().objects.map((o) => o.id)).toEqual([
        "outside-1",
      ]);
      expect(items.getHeld()).toBeNull();
    });

    it("規則の外から置かれた物は、規則が users を書き換えても片付けない", () => {
      const {objects, authority} = setup();
      objects.apply({
        type: "upsert",
        object: {
          id: "outside-1",
          kind: "dummy",
          scope: "shared",
          users: [],
          availability: "available",
          data: null,
        },
      });

      objects.interact("outside-1");
      expect(objects.getObject("outside-1")?.users).toEqual(["me"]);

      authority.release();

      expect(objects.getObject("outside-1")).toBeDefined();
    });
  });

  describe("その場で呼ぶ schedule", () => {
    it("schedule がコールバックをその場で呼んでも、待ちは結果まで進み、取り消しの一覧に残らない", () => {
      const items = createItemManager();
      const objects = createObjectManager({
        getHeldItem: () => null,
        getAuthority: () => ({playerId: "me", kind: "local", send: () => {}}),
      });
      const rules = createLocalRules({
        playerId: "me",
        objects,
        deliver: (message) =>
          applyMessage({objects, items, myPlayerId: () => "me"}, message),
        schedule: (fn) => {
          fn();
          return () => {};
        },
        newId: () => newIdOf(1),
      });
      rules.dev.deliver({
        type: "object.upsert",
        object: {
          id: "workspace-1",
          kind: "workspace",
          scope: "personal",
          owner: "me",
          users: [],
          availability: "available",
          data: null,
        },
      });

      expect(() =>
        rules.handle({
          type: "interact",
          objectId: "workspace-1",
          by: "me",
          heldItem: null,
        }),
      ).not.toThrow();
      expect(objects.getObject("workspace-1")?.users).toEqual([]);
      expect(items.getHeld()?.id).toBe(newIdOf(1));
      expect(() => rules.dispose()).not.toThrow();
    });
  });

  describe("PC", () => {
    it("spawnPc は、指定の id で、自分の personal の pc を置く(見た目は無く、データだけ)", () => {
      const {objects, authority} = setup();

      const id = authority.spawnPc("pc-1");

      expect(objects.getObject(id)).toEqual({
        id,
        kind: PC_KIND,
        scope: "personal",
        owner: "me",
        users: [],
        availability: "available",
        data: null,
      });
    });
  });

  describe("キャンバス", () => {
    it("手ぶらで interact すると、2 秒後に新しいファイル(image_created、色なし)を手に持ち、users が空に戻る", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnCanvas("canvas-1");

      objects.interact(id);

      expect(objects.getObject(id)?.users).toEqual(["me"]);
      expect(items.getHeld()).toBeNull();
      advance(CANVAS_ACTION_MS - 1);
      expect(items.getHeld()).toBeNull();
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      advance(1);
      expect(items.getHeld()).toEqual({
        id: newIdOf(1),
        kind: "file",
        data: {status: "image_created"},
      });
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("作ったファイルをディレクトリに入れると、成果物になる", () => {
      const {objects, items, authority, advance} = setup();
      const dir = authority.spawnDirectory("directory-1", []);
      const id = authority.spawnCanvas("canvas-1");
      objects.interact(id);
      advance(CANVAS_ACTION_MS);

      objects.interact(dir);

      expect(items.getHeld()).toBeNull();
      expect(
        parseDirectoryData(objects.getObject(dir)?.data ?? null).outputs,
      ).toBe(1);
    });

    it.each([
      [
        "編集前のファイル",
        {id: F1, kind: "file", data: {status: "unedited", color: "#e63946"}},
      ],
      [
        "作成したファイル(image_created)",
        {id: F2, kind: "file", data: {status: "image_created"}},
      ],
      ["ファイル以外のアイテム", {id: "l", kind: "lighter", data: null}],
    ])(
      "%sを持っていると missing_item で拒否し、アニメーションを始めない",
      (_, item) => {
        const {objects, items, authority, advance} = setup();
        const onRejected = vi.fn();
        objects.on("interactRejected", onRejected);
        const id = authority.spawnCanvas("canvas-1");
        authority.dev.setHeldItem(item);

        objects.interact(id);

        expect(onRejected).toHaveBeenCalledWith({
          objectId: id,
          reason: "missing_item",
        });
        expect(objects.getObject(id)?.users).toEqual([]);
        advance(CANVAS_ACTION_MS);
        expect(items.getHeld()).toEqual(item);
      },
    );

    it("作業中の再 interact は unavailable で拒否し、結果は 1 回だけ適用される", () => {
      const {objects, items, authority, advance} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnCanvas("canvas-1");

      objects.interact(id);
      advance(500);
      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "unavailable",
      });
      expect(objects.getObject(id)?.users).toEqual(["me"]);

      advance(CANVAS_ACTION_MS);
      expect(items.getHeld()?.data).toEqual({status: "image_created"});
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("生成中に手が塞がったら、結果は適用せず users から出るだけ", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnCanvas("canvas-1");
      objects.interact(id);
      advance(500);
      const file = {
        id: F1,
        kind: "file",
        data: {status: "unedited", color: "#e63946"},
      };
      authority.dev.setHeldItem(file);

      advance(CANVAS_ACTION_MS);

      expect(items.getHeld()).toEqual(file);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("生成中にキャンバスが消えたら、結果は適用しない", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnCanvas("canvas-1");
      objects.interact(id);

      authority.removeObject(id);
      advance(CANVAS_ACTION_MS);

      expect(items.getHeld()).toBeNull();
    });

    it("他のプレイヤーのキャンバスは not_owner で拒否する", () => {
      const {objects, authority} = setup();
      const onRejected = vi.fn();
      objects.on("interactRejected", onRejected);
      const id = authority.spawnCanvas("canvas-1");
      objects.apply({
        type: "upsert",
        object: {...objects.getObject(id)!, owner: "other"},
      });

      objects.interact(id);

      expect(onRejected).toHaveBeenCalledWith({
        objectId: id,
        reason: "not_owner",
      });
    });
  });

  describe("ワークスペース", () => {
    it("編集前のファイルを持って interact すると、2 秒後に同じ id・同じ color で edited になり、users が空に戻る", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace("workspace-1");
      authority.dev.setHeldItem({
        id: F1,
        kind: "file",
        data: {status: "unedited", color: "#e63946"},
      });

      objects.interact(id);

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
      const id = authority.spawnWorkspace("workspace-1");

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
      const id = authority.spawnWorkspace("workspace-1");
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
        getHeldItem: () => {
          const held = items.getHeld();
          return held && {id: held.id, kind: held.kind};
        },
        getAuthority: () => ({
          playerId: "me",
          kind: "local",
          send: (r) => authority.handle(r),
        }),
      });
      const authority = createLocalRules({
        playerId: "me",
        objects,
        deliver: (message) =>
          applyMessage({objects, items, myPlayerId: () => "me"}, message),
      });
      authority.dev.deliver({
        type: "object.upsert",
        object: {
          id: "workspace-1",
          kind: WORKSPACE_KIND,
          scope: "personal",
          owner: "me",
          users: [],
          availability: "available",
          data: null,
        },
      });

      vi.useFakeTimers();
      objects.interact("workspace-1");
      vi.advanceTimersByTime(WORKSPACE_ACTION_MS);
      vi.useRealTimers();

      const id = items.getHeld()?.id ?? "";
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
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
        const id = authority.spawnWorkspace("workspace-1");
        authority.dev.setHeldItem(item);

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
      const id = authority.spawnWorkspace("workspace-1");

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
      const id = authority.spawnWorkspace("workspace-1");
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
      const id = authority.spawnWorkspace("workspace-1");
      authority.dev.setHeldItem({
        id: F1,
        kind: "file",
        data: {status: "unedited", color: "#e63946"},
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
      const id = authority.spawnWorkspace("workspace-1");
      authority.dev.setHeldItem({
        id: F1,
        kind: "file",
        data: {status: "unedited"},
      });
      objects.interact(id);

      authority.spawnItem("lighter");
      advance(WORKSPACE_ACTION_MS);

      expect(items.getHeld()?.kind).toBe("lighter");
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("2 秒の間に手持ちが変わっていたら、結果は適用せず users だけ外す(新規作成)", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace("workspace-1");
      objects.interact(id);

      const lighter = authority.spawnItem("lighter");
      advance(WORKSPACE_ACTION_MS);

      expect(items.getHeld()?.id).toBe(lighter);
      expect(objects.getObject(id)?.users).toEqual([]);
    });

    it("2 秒の間に編集済みに変わっていたら、再度の編集はしない(同じ data のまま)", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace("workspace-1");
      authority.dev.setHeldItem({
        id: F1,
        kind: "file",
        data: {status: "unedited"},
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
      const id = authority.spawnWorkspace("workspace-1");
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
      const id = authority.spawnWorkspace("workspace-1");

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
      const id = authority.spawnWorkspace("workspace-1");

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
          getHeldItem: () => null,
          getAuthority: () => ({
            playerId: "me",
            kind: "local",
            send: (r) => authority.handle(r),
          }),
        });
        const authority = createLocalRules({
          playerId: "me",
          objects,
          deliver: (message) =>
            applyMessage({objects, items, myPlayerId: () => "me"}, message),
        });
        const id = "workspace-1";
        authority.dev.deliver({
          type: "object.upsert",
          object: {
            id,
            kind: WORKSPACE_KIND,
            scope: "personal",
            owner: "me",
            users: [],
            availability: "available",
            data: null,
          },
        });

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

  describe("dispose", () => {
    it("未完了のアニメーション待ちを取り消す。取り消した後は、結果は適用されない", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace("workspace-1");
      objects.interact(id);

      authority.dispose();
      advance(WORKSPACE_ACTION_MS);

      expect(items.getHeld()).toBeNull();
      expect(objects.getObject(id)?.users).toEqual(["me"]);
    });

    it("取り消すのは待ちだけで、終わった後の dispose は何もしない", () => {
      const {objects, items, authority, advance} = setup();
      const id = authority.spawnWorkspace("workspace-1");
      objects.interact(id);
      advance(WORKSPACE_ACTION_MS);
      expect(items.getHeld()?.kind).toBe("file");

      expect(() => authority.dispose()).not.toThrow();
      expect(objects.getObject(id)?.users).toEqual([]);
    });
  });

  describe("勝利フラグとライター", () => {
    const LIGHTER = {id: "lighter-1", kind: "lighter", data: null};

    it("勝利フラグは最初どちらも false。bypassPermission を立てると置き場が使えるようになり、下ろすと戻る。変わるたびに team.updated で通知する", () => {
      const {objects, team, authority} = setup();
      const stand = authority.spawnLighterStand("lighter_stand-1");
      const seen: boolean[] = [];
      team.subscribe(() => seen.push(team.get().bypassPermission));

      expect(authority.dev.getTeam()).toEqual({
        bypassPermission: false,
        fireStarted: false,
      });
      authority.dev.setTeam({bypassPermission: true});
      expect(objects.getObject(stand)?.availability).toBe("available");
      authority.dev.setTeam({bypassPermission: false});
      expect(objects.getObject(stand)?.availability).toBe("unavailable");
      expect(seen).toEqual([true, false]);
    });

    it("ライターを持ったまま bypassPermission を下ろすと、ライターは置き場へ戻る(使えない置き場で手が塞がらない)", () => {
      const {objects, items, authority} = setup();
      const stand = authority.spawnLighterStand("lighter_stand-1");
      authority.dev.setTeam({bypassPermission: true});
      objects.interact(stand);
      expect(items.getHeld()).toEqual(LIGHTER);

      authority.dev.setTeam({bypassPermission: false});

      expect(items.getHeld()).toBeNull();
      expect(objects.getObject(stand)).toMatchObject({
        availability: "unavailable",
        data: {hasLighter: true},
      });
    });

    it("値が変わらない書き換えでは、参照も変えず、通知もしない", () => {
      const {team, authority} = setup();
      const before = authority.dev.getTeam();
      const listener = vi.fn();
      team.subscribe(listener);

      authority.dev.setTeam({bypassPermission: false});

      expect(authority.dev.getTeam()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
    });

    it("bypassPermission の前は、置き場は unavailable で拒否する", () => {
      const {objects, items, authority} = setup();
      const stand = authority.spawnLighterStand("lighter_stand-1");
      const rejected = vi.fn();
      objects.on("interactRejected", rejected);

      objects.interact(stand);

      expect(rejected).toHaveBeenCalledWith({
        objectId: stand,
        reason: "unavailable",
      });
      expect(items.getHeld()).toBeNull();
    });

    it("手ぶらで置き場に触れるとライター(lighter-1)を持ち、持って触れると戻す", () => {
      const {objects, items, authority} = setup();
      const stand = authority.spawnLighterStand("lighter_stand-1");
      authority.dev.setTeam({bypassPermission: true});

      objects.interact(stand);
      expect(items.getHeld()).toEqual(LIGHTER);
      expect(objects.getObject(stand)?.data).toEqual({hasLighter: false});

      objects.interact(stand);
      expect(items.getHeld()).toBeNull();
      expect(objects.getObject(stand)?.data).toEqual({hasLighter: true});
    });

    it("置き場にライターが無ければ not_found、ファイルや他の置き場のライターを持っていれば missing_item", () => {
      const {objects, authority} = setup();
      const stand = authority.spawnLighterStand("lighter_stand-1");
      const other = authority.spawnLighterStand("lighter_stand-2");
      authority.dev.setTeam({bypassPermission: true});
      const rejected = vi.fn();
      objects.on("interactRejected", rejected);

      objects.interact(stand);
      objects.interact(other);
      expect(rejected).toHaveBeenLastCalledWith({
        objectId: other,
        reason: "missing_item",
      });

      authority.deleteHeldItem();
      objects.interact(stand);
      expect(rejected).toHaveBeenLastCalledWith({
        objectId: stand,
        reason: "not_found",
      });

      authority.spawnNewFile();
      objects.interact(other);
      expect(rejected).toHaveBeenLastCalledWith({
        objectId: other,
        reason: "missing_item",
      });
    });

    it("ライターを持ってディレクトリに触れると fireStarted が立つ。ファイルは消えず、ライターも持ったまま。2 回目は unavailable", () => {
      const {objects, items, team, authority} = setup();
      const dir = authority.spawnDirectory("directory-1", [
        {id: F1, color: "#ff0000", status: "unedited"},
      ]);
      const stand = authority.spawnLighterStand("lighter_stand-1");
      authority.dev.setTeam({bypassPermission: true});
      objects.interact(stand);
      const rejected = vi.fn();
      objects.on("interactRejected", rejected);

      objects.interact(dir);

      expect(authority.dev.getTeam()).toEqual({
        bypassPermission: true,
        fireStarted: true,
      });
      expect(team.get().fireStarted).toBe(true);
      expect(
        parseDirectoryData(objects.getObject(dir)?.data ?? null).stock,
      ).toHaveLength(1);
      expect(items.getHeld()).toEqual(LIGHTER);

      objects.interact(dir);
      expect(rejected).toHaveBeenCalledWith({
        objectId: dir,
        reason: "unavailable",
      });
    });

    it("bypassPermission の前にライターを持ってディレクトリに触れても、火はつかず missing_item", () => {
      const {objects, authority} = setup();
      const dir = authority.spawnDirectory("directory-1", []);
      authority.spawnItem("lighter");
      const rejected = vi.fn();
      objects.on("interactRejected", rejected);

      objects.interact(dir);

      expect(rejected).toHaveBeenCalledWith({
        objectId: dir,
        reason: "missing_item",
      });
      expect(authority.dev.getTeam().fireStarted).toBe(false);
    });
  });
});
