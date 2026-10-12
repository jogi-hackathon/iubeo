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

const BOARD_BEYOND_WINDOW = 5;
export const BOARD_X = -ROOM_INNER_X - BOARD_BEYOND_WINDOW;
export const BOARD_Z = WINDOW_CENTER_Z;
export const BOARD_WIDTH = 6;

const VIEW_BEYOND_WINDOW = 0.6;

const SPEED = 0.5;
const HOLD_FIRST = 2;

const LOGO_HEIGHT = 1.2;

const VISIBLE_HALF =
  (-ROOM_INNER_X - VIEW_BEYOND_WINDOW - BOARD_X) *
  Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
const OPENING_MARGIN = 0.2;

const LINE_HEIGHT: Record<CreditLine["type"], number> = {
  logo: LOGO_HEIGHT,
  heading: 0.5,
  item: 0.4,
  gap: 0.6,
  opening: VISIBLE_HALF - LOGO_HEIGHT / 2 + OPENING_MARGIN,
};

export type CreditRow = {line: CreditLine; top: number; height: number};

export type CreditLayout = {rows: CreditRow[]; height: number};

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

export const rollSeconds = (layout: CreditLayout): number =>
  HOLD_FIRST +
  (layout.height - rowCenter(layout.rows[0]) + VISIBLE_HALF + OPENING_MARGIN) /
    SPEED;

export const boardCenterY = (layout: CreditLayout, elapsed: number): number => {
  const moved = Math.max(0, elapsed - HOLD_FIRST) * SPEED;
  const top = WINDOW_CENTER_Y + rowCenter(layout.rows[0]) + moved;
  return top - layout.height / 2;
};

export const VIEW_POSITION: Vec3 = [
  -ROOM_INNER_X - VIEW_BEYOND_WINDOW,
  WINDOW_CENTER_Y,
  WINDOW_CENTER_Z,
];
export const VIEW_YAW = Math.PI / 2;
