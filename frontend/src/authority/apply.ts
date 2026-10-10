import type {Item, ItemManager} from "../items";
import type {Team} from "../net/types";
import type {GameObject, ObjectManager, RejectReason} from "../objects";
import type {PlayerId} from "../player/types";

// オーソリティ(ローカルのルール、またはサーバー)からの通知を、フロントの Manager に反映する。
// ローカルの規則もサーバーの経路(authority/server/connect.ts)も、この同じ関数で反映する。
// ここはオブジェクトと自分の手持ちと勝利フラグを扱う(プレイヤーの位置・席・接続は、それぞれの経路が扱う)

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

/** 勝利フラグの通知(サーバーの team.updated と同じ形) */
export type TeamMessage = {type: "team.updated"; team: Team};

export type AuthorityMessage = ObjectMessage | HeldMessage | TeamMessage;

export type ApplyDeps = {
  objects: Pick<ObjectManager, "getState" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
  /** 自分の ID(今)。player.updated の playerId がこれと同じときだけ、手持ちに反映する */
  myPlayerId: () => PlayerId | null;
  /** 勝利フラグの入れ物(authority/team の teamStore)。無ければ team.updated は捨てる */
  team?: {set: (team: Team) => void};
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
    case "team.updated":
      deps.team?.set(message.team);
      return;
  }
};

/**
 * snapshot を反映する: オブジェクトを丸ごと入れ替え、自分の手持ちと勝利フラグを合わせる。
 * 自分の手持ちは、snapshot の中の自分の分を呼び出し側が渡す(居なければ null)
 */
export const applySnapshot = (
  deps: Pick<ApplyDeps, "objects" | "items" | "team">,
  snapshot: {objects: readonly GameObject[]; heldItem: Item | null; team: Team},
): void => {
  const {objects, items} = deps;
  deps.team?.set(snapshot.team);
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
