import type {JsonValue} from "../core/json";

/**
 * アイテム(ファイル・ライターなど)。プレイヤーが手に持つ物で、空間には置かれない。
 * 共通の status は持たず、必要な情報は kind ごとに data に入れる
 */
export type Item = {
  id: string;
  kind: string;
  data: JsonValue;
};

/** サーバーからの通知。アイテムの Spawn / Delete はサーバーが行う */
export type ItemMessage =
  | {type: "spawn"; item: Item}
  | {type: "delete"; id: string};

export type ItemState = {
  /** 手に持っているアイテム。手は 1 つ(メインハンド)なので、持てるのは 1 個 */
  held: Item | null;
};

export type ItemEvents = {
  spawn: {item: Item};
  delete: {item: Item};
};
