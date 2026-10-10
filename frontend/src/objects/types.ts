import type {JsonValue} from "../core/json";
import type {PlayerId} from "../player/types";

/** personal は各プレイヤーの区画のもの。shared は全員共通(ディレクトリだけ) */
export type ObjectScope = "personal" | "shared";

/** 使用不可(unavailable)は、users とは別軸。例: フラグが立つ前のライター */
export type ObjectAvailability = "available" | "unavailable";

/**
 * サーバーのオブジェクトの形(スキーマと同じ)。位置・向きは持たない。置き場所と向きはシーンのレイアウト(./layout)が決める
 * kind ごとに決まる中身は data(JSON)に入れる。型は、kind が決まってから足す
 */
export type GameObject = {
  id: string;
  kind: string;
  scope: ObjectScope;
  /** personal のときだけ */
  owner?: PlayerId;
  /** 今触っているプレイヤー。personal は最大 1 人、shared は複数人 */
  users: readonly PlayerId[];
  availability: ObjectAvailability;
  data: JsonValue;
};

/** インタラクト時の手持ち(アイテム全体は要らず、識別に足りる分だけ渡す) */
export type HeldItemRef = {id: string; kind: string} | null;

/** クライアント → サーバー。状態は直接書き換えず、要求として送る */
export type InteractRequest = {
  type: "interact";
  objectId: string;
  by: PlayerId;
  /** インタラクトの条件になる手持ち。サーバーが検証する */
  heldItem: HeldItemRef;
  /** 対象の中から 1 つ選ぶときの指定(例: ディレクトリから取り出すファイルの id)。要らない物は付けない */
  target?: string;
};

/** interact に足せる指定。InteractRequest の付加項目と対応する */
export type InteractOptions = Pick<InteractRequest, "target">;

export type RejectReason =
  | "not_found"
  | "not_owner"
  | "unavailable"
  | "too_far"
  | "missing_item";

/** サーバー → クライアント。状態の正はサーバーで、ここは通知を反映するだけ */
export type ObjectMessage =
  | {type: "upsert"; object: GameObject}
  | {type: "remove"; id: string}
  | {type: "interactRejected"; objectId: string; reason: RejectReason};

export type ObjectManagerState = {objects: readonly GameObject[]};

export type ObjectEvents = {
  /** 拒否の理由。演出は MVP では付けない(触れない物にはハイライトも付けない) */
  interactRejected: {objectId: string; reason: RejectReason};
};
