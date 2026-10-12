import {CANVAS_KIND} from "../../objects/canvas/data";
import {DIRECTORY_KIND, type StockFile} from "../../objects/directory/data";
import {kindOfId, type SceneLayout} from "../../objects/layout";
import {LIGHTER_STAND_KIND} from "../../objects/lighter_stand/data";
import {PC_KIND} from "../../objects/pc/data";
import type {
  GameObject,
  ObjectAvailability,
  ObjectScope,
} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import type {PlayerId} from "../../player/types";
import {DUMMY_OBJECT_KIND} from "./rules";

export const LOCAL_AUTHORITY_PLAYER_ID: PlayerId = "local-player";

export type LocalInitialItem = {
  scope?: ObjectScope;
  availability?: ObjectAvailability;
  stock?: readonly StockFile[];
};

export type LocalInitial = Readonly<Record<string, LocalInitialItem>>;

export const planLocalObjects = ({
  layout,
  initial,
  playerId,
}: {
  layout: SceneLayout;
  initial: LocalInitial;
  playerId: PlayerId;
}): GameObject[] => {
  const planned: GameObject[] = [];
  for (const [name, item] of Object.entries(layout)) {
    const kind = kindOfId(item.id);
    const base = {id: item.id, users: [] as PlayerId[]};
    const setting = initial[name];
    if (kind === DIRECTORY_KIND) {
      planned.push({
        ...base,
        kind,
        scope: "shared",
        availability: "available",
        data: {stock: (setting?.stock ?? []).map((f) => ({...f})), outputs: 0},
      });
    } else if (
      kind === WORKSPACE_KIND ||
      kind === CANVAS_KIND ||
      kind === PC_KIND
    ) {
      planned.push({
        ...base,
        kind,
        scope: "personal",
        owner: playerId,
        availability: "available",
        data: null,
      });
    } else if (kind === LIGHTER_STAND_KIND) {
      planned.push({
        ...base,
        kind,
        scope: "personal",
        owner: playerId,
        availability: "unavailable",
        data: {hasLighter: true},
      });
    } else if (kind === DUMMY_OBJECT_KIND && setting) {
      const scope = setting.scope ?? "personal";
      planned.push({
        ...base,
        kind,
        scope,
        ...(scope === "personal" && {owner: playerId}),
        availability: setting.availability ?? "available",
        data: null,
      });
    }
  }
  return planned;
};
