import type {ItemManager} from "../items";
import type {
  GameObject,
  InteractRequest,
  ObjectAvailability,
  ObjectManager,
  ObjectScope,
} from "../objects";
import type {PlayerId} from "../player/types";
import type {Vec3} from "../props/types";

export const DUMMY_OBJECT_KIND = "dummy";
export const DUMMY_ITEM_KIND = "dummy_item";

type Deps = {
  localPlayerId: PlayerId;
  objects: Pick<ObjectManager, "getObject" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
};

/**
 * 開発時のみのダミーのサーバー役。実サーバーができるまで、要求を受けて状態を決め、その結果を
 * 通知(apply)として返す。実サーバーの挙動の写しではなく、クライアントの管理を動かすための最小限の規則
 *
 * - interact: 存在しなければ not_found、personal を owner 以外が触れば not_owner、使用不可なら
 *   unavailable で拒否。通れば、そのプレイヤーを users に出し入れする(personal は本人だけ、shared は複数人)
 */
export const createDummyAuthority = ({localPlayerId, objects, items}: Deps) => {
  let nextObject = 1;
  let nextItem = 1;

  return {
    handle: (request: InteractRequest): void => {
      const object = objects.getObject(request.objectId);
      if (!object) {
        objects.apply({
          type: "interactRejected",
          objectId: request.objectId,
          reason: "not_found",
        });
        return;
      }
      if (object.scope === "personal" && object.owner !== request.by) {
        objects.apply({
          type: "interactRejected",
          objectId: object.id,
          reason: "not_owner",
        });
        return;
      }
      if (object.availability === "unavailable") {
        objects.apply({
          type: "interactRejected",
          objectId: object.id,
          reason: "unavailable",
        });
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

    /** ダミーのアイテムを手に持たせる。持っていたアイテムは置き換わって消える */
    spawnItem: (kind: string = DUMMY_ITEM_KIND): string => {
      const id = `${kind}-${nextItem++}`;
      items.apply({type: "spawn", item: {id, kind, data: null}});
      return id;
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
