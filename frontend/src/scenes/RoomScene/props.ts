import {kindFeatures} from "../../objects/kinds";
import {featureKey, kindOfId} from "../../objects/layout";
import {ROOM_LAYOUT} from "./layout";

/** イスの表示・非表示のキー */
export const CHAIR_KEY = "chair";
/** 左の壁の窓のキー。非表示にすると空洞を壁板(WINDOW_PLUG)でふさぐ。機能は、窓の専用ジオメトリができるまで何もしない */
export const WINDOW_KEY = "window";

/**
 * room の、表示・非表示のキー。イスと窓(プロップ)と、レイアウトの項目名(オブジェクト)。
 * シーンのトグル(`getActiveToggles()` など。core/toggles)の `setVisible(key, false)` で消し、`setEnabled(key, false)` で機能を止める。消している間は、見た目だけでなく当たり判定・インタラクトも無効になる。機能 OFF は、見た目と当たり判定を残して、狙い・インタラクトだけ無効にする
 */
export const ROOM_PROP_KEYS: readonly string[] = [
  CHAIR_KEY,
  WINDOW_KEY,
  ...Object.keys(ROOM_LAYOUT),
];

/** room の機能のキー(「項目名:機能名」。項目の種類が宣言する機能から作る。例: directory:overview) */
export const ROOM_FEATURE_KEYS: readonly string[] = Object.entries(
  ROOM_LAYOUT,
).flatMap(([name, item]) =>
  kindFeatures(kindOfId(item.id)).map((f) => featureKey(name, f)),
);

export type RoomPropKey = string;
