import type {components} from "./schema.gen";

type Schemas = components["schemas"];

export type Me = Schemas["Me"];
export type MatchmakingStatus = Schemas["MatchmakingStatus"];
export type CreateSessionRequest = Schemas["CreateSessionRequest"];
export type ApiErrorBody = Schemas["Error"];

export type SessionSnapshot = Schemas["SessionSnapshot"];
export type SessionStatus = Schemas["SessionStatus"];
/** チーム共有の勝利条件フラグ(bypassPermission・fireStarted) */
export type Team = Schemas["Team"];
export type Transform = Schemas["Transform"];
/** 今のフェーズ(番号・締切・タスク一覧)。開始前は無い */
export type GamePhase = Schemas["Phase"];
export type GameTask = Schemas["Task"];
export type TaskType = Schemas["TaskType"];
export type TaskStatus = Schemas["TaskStatus"];
/** 決着の結果(victory / defeat) */
export type GameResult = Schemas["Result"];
export type Outcome = Schemas["Outcome"];

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
