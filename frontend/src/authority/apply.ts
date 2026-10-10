import type {Item, ItemManager} from "../items";
import type {GameObject, ObjectManager, RejectReason} from "../objects";
import type {PlayerId} from "../player/types";

// オーソリティ(ローカルのルール、またはサーバー)からの通知を、フロントの Manager に反映する。
// ローカルの規則もサーバーの経路(dev/multiplayer/adapter.ts)も、この同じ関数で反映する。
// ここはオブジェクトと自分の手持ちだけを扱う(プレイヤーの位置・席・接続は、それぞれの経路が扱う)

/** オブジェクトの通知(サーバーの object.upsert / object.remove / object.interactRejected と同じ形) */
export type ObjectMessage =
  | {type: "object.upsert"; object: GameObject}
  | {type: "object.remove"; id: string}
  | {type: "object.interactRejected"; objectId: string; reason: RejectReason};

/**
 * 手持ちの通知(サーバーの player.updated と同じ形。heldItem だけを使う)。
 * 自分以外のプレイヤーの分は、手持ちには反映しない
 */
export type HeldMessage = {
  type: "player.updated";
  player: {playerId: PlayerId; heldItem: Item | null};
};

export type AuthorityMessage = ObjectMessage | HeldMessage;

export type ApplyDeps = {
  objects: Pick<ObjectManager, "getState" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
  /** 自分の ID(今)。player.updated の playerId がこれと同じときだけ、手持ちに反映する */
  myPlayerId: () => PlayerId | null;
};

/** 自分の手持ちを、通知の heldItem に合わせる(違えば spawn・無ければ delete) */
export const syncHeld = (
  items: Pick<ItemManager, "getHeld" | "apply">,
  heldItem: Item | null,
): void => {
  const held = items.getHeld();
  if (heldItem) {
    // 同じ id でも、中身(編集済みなど)が変わっていれば spawn で更新する
    if (JSON.stringify(held) !== JSON.stringify(heldItem)) {
      items.apply({type: "spawn", item: heldItem});
    }
  } else if (held) {
    items.apply({type: "delete", id: held.id});
  }
};

/** 通知を 1 つ反映する */
export const applyMessage = (deps: ApplyDeps, message: AuthorityMessage) => {
  switch (message.type) {
    case "object.upsert":
      deps.objects.apply({type: "upsert", object: message.object});
      return;
    case "object.remove":
      deps.objects.apply({type: "remove", id: message.id});
      return;
    case "object.interactRejected":
      deps.objects.apply({
        type: "interactRejected",
        objectId: message.objectId,
        reason: message.reason,
      });
      return;
    case "player.updated":
      if (message.player.playerId === deps.myPlayerId()) {
        syncHeld(deps.items, message.player.heldItem);
      }
      return;
  }
};

/**
 * snapshot を反映する: オブジェクトを丸ごと入れ替え、自分の手持ちを合わせる。
 * 自分の手持ちは、snapshot の中の自分の分を呼び出し側が渡す(居なければ null)
 */
export const applySnapshot = (
  deps: Pick<ApplyDeps, "objects" | "items">,
  snapshot: {objects: readonly GameObject[]; heldItem: Item | null},
): void => {
  const {objects, items} = deps;
  const ids = new Set(snapshot.objects.map((o) => o.id));
  for (const o of objects.getState().objects) {
    if (!ids.has(o.id)) {
      objects.apply({type: "remove", id: o.id});
    }
  }
  for (const object of snapshot.objects) {
    objects.apply({type: "upsert", object});
  }
  syncHeld(items, snapshot.heldItem);
};
