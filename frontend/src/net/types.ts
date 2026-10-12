import type {components} from "./schema.gen";

type Schemas = components["schemas"];

export type Me = Schemas["Me"];
export type MatchmakingStatus = Schemas["MatchmakingStatus"];
export type ApiErrorBody = Schemas["Error"];

export type SessionSnapshot = Schemas["SessionSnapshot"];
export type SessionStatus = Schemas["SessionStatus"];
export type Team = Schemas["Team"];
export type Transform = Schemas["Transform"];
export type GamePhase = Schemas["Phase"];
export type GameTask = Schemas["Task"];
export type TaskType = Schemas["TaskType"];
export type TaskStatus = Schemas["TaskStatus"];
export type GameResult = Schemas["Result"];
export type Outcome = Schemas["Outcome"];

export type ClientMessage = Schemas["ClientMessage"];
export type TransformMessage = Schemas["TransformMessage"];
export type InteractMessage = Schemas["InteractMessage"];

export type ServerMessage = Schemas["ServerMessage"];
export type ServerMessageType = ServerMessage["type"];
export type ServerMessageOf<T extends ServerMessageType> = Extract<
  ServerMessage,
  {type: T}
>;
