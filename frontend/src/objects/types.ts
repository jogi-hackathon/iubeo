import type {JsonValue} from "../core/json";
import type {PlayerId} from "../player/types";

export type ObjectScope = "personal" | "shared";

export type ObjectAvailability = "available" | "unavailable";

export type GameObject = {
  id: string;
  kind: string;
  scope: ObjectScope;
  owner?: PlayerId;
  users: readonly PlayerId[];
  availability: ObjectAvailability;
  data: JsonValue;
};

export type HeldItemRef = {id: string; kind: string} | null;

export type InteractRequest = {
  type: "interact";
  objectId: string;
  by: PlayerId;
  heldItem: HeldItemRef;
  target?: string;
};

export type InteractOptions = Pick<InteractRequest, "target">;

export type RejectReason =
  | "not_found"
  | "not_owner"
  | "unavailable"
  | "too_far"
  | "missing_item";

export type ObjectMessage =
  | {type: "upsert"; object: GameObject}
  | {type: "remove"; id: string}
  | {type: "interactRejected"; objectId: string; reason: RejectReason};

export type ObjectManagerState = {objects: readonly GameObject[]};

export type ObjectEvents = {
  interactRejected: {objectId: string; reason: RejectReason};
};
