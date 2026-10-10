import type {components} from "./schema.gen";

// backend/api/openapi.yaml から生成した型(schema.gen.ts)に、使う名前を付ける。
// 生成は `pnpm gen:api`。schema.gen.ts は手で書き換えない

type Schemas = components["schemas"];

export type Me = Schemas["Me"];
export type MatchmakingStatus = Schemas["MatchmakingStatus"];
export type CreateSessionRequest = Schemas["CreateSessionRequest"];
export type ApiErrorBody = Schemas["Error"];

export type SessionSnapshot = Schemas["SessionSnapshot"];
/** チーム共有の勝利条件フラグ(bypassPermission・fireStarted) */
export type Team = Schemas["Team"];
export type Transform = Schemas["Transform"];

/** クライアント → サーバー */
export type ClientMessage = Schemas["ClientMessage"];
export type TransformMessage = Schemas["TransformMessage"];
export type InteractMessage = Schemas["InteractMessage"];

/** サーバー → クライアント */
export type ServerMessage = Schemas["ServerMessage"];
export type ServerMessageType = ServerMessage["type"];
/** type から、そのメッセージの型を引く。例: ServerMessageOf<"object.upsert"> */
export type ServerMessageOf<T extends ServerMessageType> = Extract<
  ServerMessage,
  {type: T}
>;
