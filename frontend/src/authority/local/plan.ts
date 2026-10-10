import {CANVAS_KIND} from "../../objects/canvas/data";
import {DIRECTORY_KIND, type StockFile} from "../../objects/directory/data";
import {kindOfId, type SceneLayout} from "../../objects/layout";
import {PC_KIND} from "../../objects/pc/data";
import type {
  GameObject,
  ObjectAvailability,
  ObjectScope,
} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import type {PlayerId} from "../../player/types";
import {DUMMY_OBJECT_KIND} from "./rules";

/** ローカルのオーソリティの自分の ID(ローカルで動かすときの固定値。サーバーにつないだら、サーバーが発行した ID を使う) */
export const LOCAL_AUTHORITY_PLAYER_ID: PlayerId = "local-player";

/**
 * シーンが決める、置く物の初期設定(項目名ごと)。ここに無い項目は、種類で決まる既定の置き方になる
 * (ダミーの箱は、ここに書いた項目だけ置く。予備のダミーは書かないので置かれない)
 */
export type LocalInitialItem = {
  /** ダミーの箱の scope(既定は personal) */
  scope?: ObjectScope;
  /** ダミーの箱の使えるか(既定は available) */
  availability?: ObjectAvailability;
  /** ディレクトリの在庫(既定は空) */
  stock?: readonly StockFile[];
};

export type LocalInitial = Readonly<Record<string, LocalInitialItem>>;

/**
 * 置く物を決める(純粋な関数)。レイアウトの項目を順に見て、
 * - directory: 共有(shared)。在庫は initial の stock
 * - workspace・canvas・pc: 自分の個人(personal、owner は自分)
 * - dummy: initial に書いてある項目だけ(scope と availability は initial)
 * - それ以外の種類: 置かない(まだ持たない種類)
 * の GameObject を返す。id はレイアウトの id(サーバーの採番ではない)
 */
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
