import {LAPTOP} from "./dimensions";

export type KeyCap = {x: number; z: number; width: number; depth: number};

const U = 0.019;
const GAP = 0.003;
const ROW_UNITS = 15;
const FN_ROW_DEPTH = 0.5;
const FN_KEYS = 14;
const ARROW_KEYS = 3;
const BACK_MARGIN = 0.014;

const MAIN_ROWS: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
  [1, 1, 1, 1.25, 5.5, 1.25, 1, 1, 1, 1],
];

const DEPTH = (FN_ROW_DEPTH + MAIN_ROWS.length) * U;

export const KEYBOARD = {
  width: ROW_UNITS * U,
  depth: DEPTH,
  z: LAPTOP.z - LAPTOP.depth / 2 + BACK_MARGIN + DEPTH / 2,
} as const;

const row = (
  units: readonly number[],
  z: number,
  depthUnits: number,
): KeyCap[] => {
  const caps: KeyCap[] = [];
  let left = -KEYBOARD.width / 2;
  for (const w of units) {
    caps.push({
      x: left + (w * U) / 2,
      z,
      width: w * U - GAP,
      depth: depthUnits * U - GAP,
    });
    left += w * U;
  }
  return caps;
};

const splitArrows = (bottom: KeyCap[]): KeyCap[] => {
  const arrows = bottom.splice(-ARROW_KEYS);
  const half = 0.5;
  const lower = arrows.map((cap) => ({
    ...cap,
    z: cap.z + U / 4,
    depth: half * U - GAP,
  }));
  const middle = arrows[1]!;
  const up = {...middle, z: middle.z - U / 4, depth: half * U - GAP};
  return [...bottom, ...lower, up];
};

const build = (): KeyCap[] => {
  const back = -KEYBOARD.depth / 2;
  const fnRow = row(
    Array.from({length: FN_KEYS}, () => ROW_UNITS / FN_KEYS),
    back + (FN_ROW_DEPTH * U) / 2,
    FN_ROW_DEPTH,
  );
  const main = MAIN_ROWS.flatMap((units, i) =>
    row(units, back + FN_ROW_DEPTH * U + (i + 0.5) * U, 1),
  );
  const bottomStart = main.length - MAIN_ROWS[MAIN_ROWS.length - 1]!.length;
  return [
    ...fnRow,
    ...main.slice(0, bottomStart),
    ...splitArrows(main.slice(bottomStart)),
  ];
};

export const KEY_CAPS: readonly KeyCap[] = build();

export type KeyCapGroup = {
  width: number;
  depth: number;
  caps: readonly KeyCap[];
};

const groupBySize = (caps: readonly KeyCap[]): KeyCapGroup[] => {
  const groups = new Map<string, KeyCapGroup>();
  for (const cap of caps) {
    const key = `${cap.width.toFixed(6)}:${cap.depth.toFixed(6)}`;
    const group = groups.get(key);
    if (group) {
      (group.caps as KeyCap[]).push(cap);
    } else {
      groups.set(key, {width: cap.width, depth: cap.depth, caps: [cap]});
    }
  }
  return [...groups.values()];
};

export const KEY_CAP_GROUPS: readonly KeyCapGroup[] = groupBySize(KEY_CAPS);
