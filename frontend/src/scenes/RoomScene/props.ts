import {kindFeatures} from "../../objects/kinds";
import {featureKey, kindOfId} from "../../objects/layout";
import {ROOM_LAYOUT} from "./layout";

export const CHAIR_KEY = "chair";
export const WINDOW_KEY = "window";

export const ROOM_PROP_KEYS: readonly string[] = [
  CHAIR_KEY,
  WINDOW_KEY,
  ...Object.keys(ROOM_LAYOUT),
];

export const ROOM_FEATURE_KEYS: readonly string[] = Object.entries(
  ROOM_LAYOUT,
).flatMap(([name, item]) =>
  kindFeatures(kindOfId(item.id)).map((f) => featureKey(name, f)),
);

export type RoomPropKey = string;
