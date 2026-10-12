import {CAMERA_FOV} from "../../../camera/constants";
import type {Vec3} from "../../../props/types";
import {
  ROOM_INNER_X,
  WINDOW_CENTER_Z,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
} from "../layout";
import type {CreditLine} from "./content";

const WINDOW_CENTER_Y = WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2;

/** クレジットの板。窓(壁の室内側の面)からさらに外に置き、窓の中心の正面を部屋へ向ける */
const BOARD_BEYOND_WINDOW = 5;
export const BOARD_X = -ROOM_INNER_X - BOARD_BEYOND_WINDOW;
export const BOARD_Z = WINDOW_CENTER_Z;
export const BOARD_WIDTH = 6;

/** クレジットを見る間のカメラを置く、壁(室内側の面)からの外への距離 */
const VIEW_BEYOND_WINDOW = 0.6;

/** 流れる速さ(m/秒) */
const SPEED = 0.5;
/** 最初の行(ロゴ)を真ん中に止めて見せる秒数 */
const HOLD_FIRST = 2;

const LOGO_HEIGHT = 1.2;

/** 窓の外のカメラ(VIEW_POSITION)から、板の位置で画面に映る縦の半分(m) */
const VISIBLE_HALF =
  (-ROOM_INNER_X - VIEW_BEYOND_WINDOW - BOARD_X) *
  Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
/** ロゴを真ん中に止めている間、次の行がちょうど画面の下の外にあるようにする(少しだけ余らせる) */
const OPENING_MARGIN = 0.2;

/** 行ごとの高さ(m) */
const LINE_HEIGHT: Record<CreditLine["type"], number> = {
  logo: LOGO_HEIGHT,
  heading: 0.5,
  item: 0.4,
  gap: 0.6,
  opening: VISIBLE_HALF - LOGO_HEIGHT / 2 + OPENING_MARGIN,
};

export type CreditRow = {line: CreditLine; top: number; height: number};

export type CreditLayout = {rows: CreditRow[]; height: number};

/** 行を上から積む。top は板の上端からの距離(m) */
export const layoutCredits = (lines: readonly CreditLine[]): CreditLayout => {
  let top = 0;
  const rows = lines.map((line) => {
    const height = LINE_HEIGHT[line.type];
    const row = {line, top, height};
    top += height;
    return row;
  });
  return {rows, height: top};
};

const rowCenter = (row: CreditRow | undefined): number =>
  row ? row.top + row.height / 2 : 0;

/**
 * 見せ始めてから流し終わるまで(秒)。最初の行(ロゴ)を真ん中に止めて見せてから流し、
 * 最後の行が画面の上の外へ出て何も映らなくなったら終わる
 */
export const rollSeconds = (layout: CreditLayout): number =>
  HOLD_FIRST +
  (layout.height - rowCenter(layout.rows[0]) + VISIBLE_HALF + OPENING_MARGIN) /
    SPEED;

/** 見せ始めてから elapsed 秒のときの板の中心の高さ。ロゴを真ん中に止めて見せてから、上へ流し続ける */
export const boardCenterY = (layout: CreditLayout, elapsed: number): number => {
  const moved = Math.max(0, elapsed - HOLD_FIRST) * SPEED;
  const top = WINDOW_CENTER_Y + rowCenter(layout.rows[0]) + moved;
  return top - layout.height / 2;
};

/**
 * クレジットを見る間のカメラ。窓を抜けて壁のすぐ外に出て、窓の中心の高さから板を正面に見る(窓枠は画面に入らない)。
 * 一人称の目からここまで寄っていくことで、窓からズームして外を見る演出にする
 */
export const VIEW_POSITION: Vec3 = [
  -ROOM_INNER_X - VIEW_BEYOND_WINDOW,
  WINDOW_CENTER_Y,
  WINDOW_CENTER_Z,
];
/** -x(窓の外)を向く yaw(一人称と同じく、yaw 0 で -z を向く) */
export const VIEW_YAW = Math.PI / 2;
