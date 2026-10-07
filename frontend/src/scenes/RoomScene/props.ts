import {CANVAS_KIND} from "../../objects/canvas/data";
import {DIRECTORY_KIND} from "../../objects/directory/data";
import {PC_KIND} from "../../objects/pc/data";
import {WORKSPACE_KIND} from "../../objects/workspace/data";

/** イスの表示・非表示のキー(オブジェクトは kind がそのままキー) */
export const CHAIR_KEY = "chair";
/** 左の壁の窓のキー。非表示にすると空洞を壁板(WINDOW_PLUG)でふさぐ。機能は、窓の専用ジオメトリができるまで何もしない */
export const WINDOW_KEY = "window";

/**
 * room の各オブジェクト・プロップの、表示・非表示のキー。シーンのトグル(`getActiveToggles()` など。core/toggles)の `setVisible(key, false)` で消し、`setEnabled(key, false)` で機能を止める。消している間は、見た目だけでなく当たり判定・インタラクトも無効になる。機能 OFF は、見た目と当たり判定を残して、狙い・インタラクトだけ無効にする
 */
export const ROOM_PROP_KEYS = [
  CHAIR_KEY,
  WINDOW_KEY,
  DIRECTORY_KIND,
  WORKSPACE_KIND,
  CANVAS_KIND,
  PC_KIND,
] as const;

export type RoomPropKey = (typeof ROOM_PROP_KEYS)[number];
