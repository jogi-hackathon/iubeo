import type {Point, Rect, Size} from "./geometry";

/** 画面の画素数(2000 の標準の 640×480)。PC の画面の板と同じ 4:3 */
export const SCREEN: Size = {width: 640, height: 480};

export const TASKBAR_HEIGHT = 28;

/** 窓を置ける範囲(タスクバーより上) */
export const WORK_AREA: Rect = {
  x: 0,
  y: 0,
  width: SCREEN.width,
  height: SCREEN.height - TASKBAR_HEIGHT,
};

export const TASKBAR: Rect = {
  x: 0,
  y: WORK_AREA.height,
  width: SCREEN.width,
  height: TASKBAR_HEIGHT,
};

const BAR_BUTTON_HEIGHT = 22;
const BAR_BUTTON_Y = TASKBAR.y + 4;

export const START_BUTTON: Rect = {
  x: 2,
  y: BAR_BUTTON_Y,
  width: 72,
  height: BAR_BUTTON_HEIGHT,
};

export const TRAY: Rect = {
  x: SCREEN.width - 62,
  y: BAR_BUTTON_Y,
  width: 60,
  height: BAR_BUTTON_HEIGHT,
};

const TASK_LEFT = START_BUTTON.x + START_BUTTON.width + 6;
const TASK_RIGHT = TRAY.x - 4;
const TASK_GAP = 3;
const TASK_MAX_WIDTH = 150;

/** タスクバーの、開いている窓のボタン(開いた順に左から) */
export const taskButtonRects = (count: number): Rect[] => {
  if (count === 0) {
    return [];
  }
  const room = TASK_RIGHT - TASK_LEFT - TASK_GAP * (count - 1);
  const width = Math.min(TASK_MAX_WIDTH, Math.floor(room / count));
  return Array.from({length: count}, (_, i) => ({
    x: TASK_LEFT + i * (width + TASK_GAP),
    y: BAR_BUTTON_Y,
    width,
    height: BAR_BUTTON_HEIGHT,
  }));
};

/** 窓の枠の太さとタイトルバーの高さ */
export const FRAME = {border: 4, title: 18, gap: 1} as const;

const TITLE_BUTTON = {width: 16, height: 14} as const;

export const windowSizeFor = (client: Size): Size => ({
  width: client.width + FRAME.border * 2,
  height: client.height + FRAME.border * 2 + FRAME.title + FRAME.gap,
});

export const titleBarRect = (win: Rect): Rect => ({
  x: win.x + FRAME.border - 1,
  y: win.y + FRAME.border - 1,
  width: win.width - (FRAME.border - 1) * 2,
  height: FRAME.title,
});

export const clientRect = (win: Rect): Rect => ({
  x: win.x + FRAME.border,
  y: win.y + FRAME.border - 1 + FRAME.title + FRAME.gap,
  width: win.width - FRAME.border * 2,
  height: win.height - FRAME.border * 2 - FRAME.title - FRAME.gap + 1,
});

export const closeButtonRect = (win: Rect): Rect => {
  const title = titleBarRect(win);
  return {
    x: title.x + title.width - 2 - TITLE_BUTTON.width,
    y: title.y + 2,
    ...TITLE_BUTTON,
  };
};

export const minimizeButtonRect = (win: Rect): Rect => {
  const close = closeButtonRect(win);
  return {...close, x: close.x - 2 - TITLE_BUTTON.width};
};

/** 新しく開く窓の位置。作業領域の中央から、開いている窓の数だけ右下へずらす */
export const cascadePosition = (size: Size, index: number): Point => {
  const step = 20 * (index % 5);
  return {
    x: Math.max(0, Math.round((WORK_AREA.width - size.width) / 2) - 40 + step),
    y: Math.max(
      0,
      Math.round((WORK_AREA.height - size.height) / 2) - 40 + step,
    ),
  };
};

/** タイトルバーの一部が必ず作業領域に残るように、窓の位置を収める */
export const keepTitleVisible = (win: Rect): Point => {
  const keep = 40;
  return {
    x: Math.max(keep - win.width, Math.min(WORK_AREA.width - keep, win.x)),
    y: Math.max(0, Math.min(WORK_AREA.height - FRAME.title, win.y)),
  };
};

const ICON_CELL = {width: 72, height: 66} as const;
const ICON_ORIGIN = {x: 6, y: 8} as const;
export const ICON_SIZE = 32;

/** デスクトップのアイコンのマス(左の列に上から並べる) */
export const iconCellRect = (index: number): Rect => ({
  x: ICON_ORIGIN.x,
  y: ICON_ORIGIN.y + index * ICON_CELL.height,
  ...ICON_CELL,
});

export type StartMenuEntry =
  | {kind: "app"; appId: string}
  | {kind: "separator"}
  | {kind: "shutdown"};

const START_MENU_WIDTH = 176;
export const START_MENU_BANNER = 22;
const START_ITEM_HEIGHT = 26;
const START_SEPARATOR_HEIGHT = 8;
const START_MENU_PADDING = 3;

const entryHeight = (entry: StartMenuEntry): number =>
  entry.kind === "separator" ? START_SEPARATOR_HEIGHT : START_ITEM_HEIGHT;

/** スタートメニューの外枠(タスクバーの上に、スタートボタンの左端から開く) */
export const startMenuRect = (entries: readonly StartMenuEntry[]): Rect => {
  const height =
    entries.reduce((sum, e) => sum + entryHeight(e), 0) +
    START_MENU_PADDING * 2;
  return {
    x: START_BUTTON.x,
    y: TASKBAR.y - height + 2,
    width: START_MENU_WIDTH,
    height,
  };
};

export const startEntryRects = (entries: readonly StartMenuEntry[]): Rect[] => {
  const menu = startMenuRect(entries);
  let y = menu.y + START_MENU_PADDING;
  return entries.map((entry) => {
    const rect = {
      x: menu.x + START_MENU_BANNER + START_MENU_PADDING,
      y,
      width: menu.width - START_MENU_BANNER - START_MENU_PADDING * 2,
      height: entryHeight(entry),
    };
    y += rect.height;
    return rect;
  });
};
