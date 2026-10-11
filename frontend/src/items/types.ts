import type {JsonValue} from "../core/json";

export type Item = {
  id: string;
  kind: string;
  data: JsonValue;
};

export type ItemMessage =
  | {type: "spawn"; item: Item}
  | {type: "delete"; id: string};

export type ItemState = {
  held: Item | null;
};

export type ItemEvents = {
  spawn: {item: Item};
  delete: {item: Item};
};
