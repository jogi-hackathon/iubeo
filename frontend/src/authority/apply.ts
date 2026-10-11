import type {Item, ItemManager} from "../items";
import type {Team} from "../net/types";
import type {GameObject, ObjectManager, RejectReason} from "../objects";
import type {PlayerId} from "../player/types";

export type ObjectMessage =
  | {type: "object.upsert"; object: GameObject}
  | {type: "object.remove"; id: string}
  | {type: "object.interactRejected"; objectId: string; reason: RejectReason};

export type HeldMessage = {
  type: "player.updated";
  player: {playerId: PlayerId; heldItem: Item | null};
};

export type TeamMessage = {type: "team.updated"; team: Team};

export type AuthorityMessage = ObjectMessage | HeldMessage | TeamMessage;

export type ApplyDeps = {
  objects: Pick<ObjectManager, "getState" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
  myPlayerId: () => PlayerId | null;
  team?: {set: (team: Team) => void};
};

export const syncHeld = (
  items: Pick<ItemManager, "getHeld" | "apply">,
  heldItem: Item | null,
): void => {
  const held = items.getHeld();
  if (heldItem) {
    if (JSON.stringify(held) !== JSON.stringify(heldItem)) {
      items.apply({type: "spawn", item: heldItem});
    }
  } else if (held) {
    items.apply({type: "delete", id: held.id});
  }
};

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
