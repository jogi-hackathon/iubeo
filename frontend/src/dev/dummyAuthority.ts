import {
  type CreatedStatus,
  FILE_KIND,
  type ItemManager,
  isCreatedStatus,
  parseFileData,
} from "../items";
import type {
  GameObject,
  InteractRequest,
  ObjectAvailability,
  ObjectManager,
  ObjectScope,
  RejectReason,
} from "../objects";
import {
  DIRECTORY_KIND,
  type StockFile,
  parseDirectoryData,
} from "../objects/directory/data";
import type {PlayerId} from "../player/types";
import type {Vec3} from "../props/types";

export const DUMMY_OBJECT_KIND = "dummy";
export const DUMMY_ITEM_KIND = "dummy_item";

type Deps = {
  localPlayerId: PlayerId;
  objects: Pick<ObjectManager, "getObject" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
  /** 他プレイヤーが借りるファイルを選ぶ乱数([0, 1))。テストで固定する用 */
  random?: () => number;
  /** 新しいファイルの id を採番する。テストで固定する用。既定は crypto.randomUUID */
  newId?: () => string;
};

/**
 * 開発時のみのダミーのサーバー役。実サーバーができるまで、要求を受けて状態を決め、その結果を
 * 通知(apply)として返す。実サーバーの挙動の写しではなく、クライアントの管理を動かすための最小限の規則
 *
 * - interact: 存在しなければ not_found、personal を owner 以外が触れば not_owner、使用不可なら
 *   unavailable で拒否。通れば、そのプレイヤーを users に出し入れする(personal は本人だけ、shared は複数人)
 * - ディレクトリ(kind "directory")の interact は、users の出し入れはせず、手持ちで決める:
 *   - 手ぶら + target: 在庫にあれば取り除き、そのファイルを手に持たせる(先着。無ければ not_found)。target が無ければ missing_item
 *   - ファイルを持って: 手持ちを消して、status で行き先を決める
 *     edited → 在庫に戻り達成 +1(同じファイルは 1 回だけ。取り出して入れ直しても増えない)、unedited → 在庫に戻るだけ、作成系(file_created / search_created / image_created)→ 成果物 +1
 *   - ファイル以外を持って: missing_item
 */
export const createDummyAuthority = ({
  localPlayerId,
  objects,
  items,
  random = Math.random,
  newId = () => crypto.randomUUID(),
}: Deps) => {
  let nextObject = 1;
  let nextItem = 1;
  // 達成したファイルの id(サーバーが数える物。クライアントには渡らないので、デバッグパネル用に持つ)。
  // 編集済みを取り出して入れ直しても、同じファイルは 1 回しか数えない
  const achievedIds = new Set<string>();
  // 他のプレイヤーが借りているファイル(貸出方式。ディレクトリの在庫からは外れている)
  const borrowed: Array<{directoryId: string; file: StockFile}> = [];

  const reject = (objectId: string, reason: RejectReason) =>
    objects.apply({type: "interactRejected", objectId, reason});

  const setDirectory = (
    object: GameObject,
    data: {stock: StockFile[]; outputs: number},
  ) => objects.apply({type: "upsert", object: {...object, data}});

  const handleDirectory = (object: GameObject, request: InteractRequest) => {
    const data = parseDirectoryData(object.data);
    const heldRef = request.heldItem;

    if (!heldRef) {
      if (request.target === undefined) {
        reject(object.id, "missing_item");
        return;
      }
      const file = data.stock.find((f) => f.id === request.target);
      if (!file) {
        reject(object.id, "not_found");
        return;
      }
      setDirectory(object, {
        ...data,
        stock: data.stock.filter((f) => f.id !== file.id),
      });
      items.apply({
        type: "spawn",
        item: {
          id: file.id,
          kind: FILE_KIND,
          data: {status: file.status, color: file.color},
        },
      });
      return;
    }

    // 要求の手持ちの主張ではなく、実際の手持ちで決める(data は要求に載らない)
    const held = items.getHeld();
    const file =
      held && held.id === heldRef.id && held.kind === FILE_KIND
        ? parseFileData(held.data)
        : null;
    if (!held || !file) {
      reject(object.id, "missing_item");
      return;
    }
    if (isCreatedStatus(file.status)) {
      setDirectory(object, {...data, outputs: data.outputs + 1});
    } else {
      // 貸出方式: 取り出し元のファイルは、編集の有無によらず在庫に戻る
      const back: StockFile = {
        id: held.id,
        color: file.color ?? "#ffffff",
        status: file.status,
      };
      if (file.status === "edited") {
        achievedIds.add(held.id);
      }
      setDirectory(object, {...data, stock: [...data.stock, back]});
    }
    items.apply({type: "delete", id: held.id});
  };

  const spawnNew = (status: CreatedStatus): string => {
    const id = newId();
    items.apply({
      type: "spawn",
      item: {id, kind: FILE_KIND, data: {status}},
    });
    return id;
  };

  return {
    handle: (request: InteractRequest): void => {
      const object = objects.getObject(request.objectId);
      if (!object) {
        reject(request.objectId, "not_found");
        return;
      }
      if (object.scope === "personal" && object.owner !== request.by) {
        reject(object.id, "not_owner");
        return;
      }
      if (object.availability === "unavailable") {
        reject(object.id, "unavailable");
        return;
      }
      if (object.kind === DIRECTORY_KIND) {
        handleDirectory(object, request);
        return;
      }
      const using = object.users.includes(request.by);
      const users = using
        ? object.users.filter((u) => u !== request.by)
        : [...object.users, request.by];
      objects.apply({type: "upsert", object: {...object, users}});
    },

    /** ダミーのオブジェクトを置き、その id を返す */
    spawnObject: (
      position: Vec3,
      scope: ObjectScope = "personal",
      availability: ObjectAvailability = "available",
    ): string => {
      const object: GameObject = {
        id: `${DUMMY_OBJECT_KIND}-${nextObject++}`,
        kind: DUMMY_OBJECT_KIND,
        scope,
        ...(scope === "personal" && {owner: localPlayerId}),
        position,
        users: [],
        availability,
        data: null,
      };
      objects.apply({type: "upsert", object});
      return object.id;
    },
    removeObject: (id: string): void => {
      objects.apply({type: "remove", id});
    },
    setAvailability: (id: string, availability: ObjectAvailability): void => {
      const object = objects.getObject(id);
      if (object) {
        objects.apply({type: "upsert", object: {...object, availability}});
      }
    },

    /** ディレクトリを置き(shared)、その id を返す。stock は今ディレクトリの中にあるファイル */
    spawnDirectory: (position: Vec3, stock: readonly StockFile[]): string => {
      const object: GameObject = {
        id: `${DIRECTORY_KIND}-${nextObject++}`,
        kind: DIRECTORY_KIND,
        scope: "shared",
        position,
        users: [],
        availability: "available",
        data: {stock: stock.map((f) => ({...f})), outputs: 0},
      };
      objects.apply({type: "upsert", object});
      return object.id;
    },
    /** 達成の数(編集した在庫のファイルが、ディレクトリに入ったファイルの数。同じファイルは 1 回) */
    getAchieved: (): number => achievedIds.size,
    /** 他のプレイヤーが借りているファイルの数 */
    getBorrowedCount: (): number => borrowed.length,
    /** 他のプレイヤーとして、ディレクトリの在庫からランダムに 1 つ借りる。借りた id を返す(在庫が空なら null) */
    borrowAsOther: (directoryId: string): string | null => {
      const object = objects.getObject(directoryId);
      if (!object) {
        return null;
      }
      const data = parseDirectoryData(object.data);
      const file = data.stock[Math.floor(random() * data.stock.length)];
      if (!file) {
        return null;
      }
      borrowed.push({directoryId, file});
      setDirectory(object, {
        ...data,
        stock: data.stock.filter((f) => f.id !== file.id),
      });
      return file.id;
    },
    /** 他のプレイヤーが借りているファイルを、そのディレクトリに 1 つ返す(借りた順)。返した id を返す */
    returnAsOther: (directoryId: string): string | null => {
      const index = borrowed.findIndex((b) => b.directoryId === directoryId);
      const object = objects.getObject(directoryId);
      const entry = borrowed[index];
      if (!entry || !object) {
        return null;
      }
      borrowed.splice(index, 1);
      const data = parseDirectoryData(object.data);
      setDirectory(object, {...data, stock: [...data.stock, entry.file]});
      return entry.file.id;
    },

    /** ダミーのアイテムを手に持たせる。持っていたアイテムは置き換わって消える */
    spawnItem: (kind: string = DUMMY_ITEM_KIND): string => {
      const id = `${kind}-${nextItem++}`;
      items.apply({type: "spawn", item: {id, kind, data: null}});
      return id;
    },
    /** 新しく作ったファイル(ワークスペースで作る物の代わり)を手に持たせる。取り出し元ではなく、色も無い */
    spawnNewFile: (status: CreatedStatus = "file_created"): string =>
      spawnNew(status),
    /** 手持ちのファイルを編集済みにする(同じ id で status を "edited" に更新する。ワークスペースの編集の代わり)。作成したファイルは編集できず、編集できたら true */
    editHeldFile: (): boolean => {
      const held = items.getHeld();
      const file =
        held && held.kind === FILE_KIND ? parseFileData(held.data) : null;
      // 作成したファイルは編集しない
      if (!held || !file || isCreatedStatus(file.status)) {
        return false;
      }
      items.apply({
        type: "spawn",
        item: {...held, data: {...file, status: "edited"}},
      });
      return true;
    },
    deleteHeldItem: (): void => {
      const held = items.getHeld();
      if (held) {
        items.apply({type: "delete", id: held.id});
      }
    },
  };
};

export type DummyAuthority = ReturnType<typeof createDummyAuthority>;
