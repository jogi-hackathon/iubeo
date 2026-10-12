import type {AppView, DesktopApp} from "./app";
import {contains, type Rect} from "./geometry";
import {
  cascadePosition,
  clientRect,
  closeButtonRect,
  iconCellRect,
  keepTitleVisible,
  minimizeButtonRect,
  START_BUTTON,
  type StartMenuEntry,
  startEntryRects,
  startMenuRect,
  taskButtonRects,
  titleBarRect,
  windowSizeFor,
} from "./layout";

export type ShellPointerEvent = {
  type: "move" | "down" | "up";
  x: number;
  y: number;
  button: number;
};

export type ShellWindow = {
  id: number;
  app: DesktopApp;
  view: AppView;
  rect: Rect;
  minimized: boolean;
};

/** 押している途中のボタン。離したときに同じボタンの上なら押したことにする */
export type Pressed =
  | {kind: "close"; windowId: number}
  | {kind: "minimize"; windowId: number}
  | {kind: "task"; windowId: number}
  | {kind: "start"}
  | {kind: "startEntry"; index: number};

export type ShellState = {
  /** 重なり順(後ろほど手前) */
  windows: readonly ShellWindow[];
  /** タスクバーのボタンの並び(開いた順) */
  taskOrder: readonly number[];
  focused: number | null;
  selectedIcon: string | null;
  startOpen: boolean;
  hoveredEntry: number | null;
  pressed: Pressed | null;
};

const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_SLOP = 4;

type Options = {
  apps: readonly DesktopApp[];
  now?: () => number;
};

/**
 * 2000 風のデスクトップの状態と、マウスの入力の解釈(描画は paint/、画素の置き場所は layout.ts)。
 *
 * - アイコン: クリックで選び、ダブルクリックでアプリを開く(同じアプリの窓は 1 つだけ)
 * - 窓: 押すと手前へ。タイトルバーでつかんで動かし、_ で最小化、× で閉じる。中身の入力はアプリへ渡す
 * - タスクバー: スタートでメニューを開く。窓のボタンは、最小化なら戻し、手前なら最小化し、それ以外は手前へ
 * - スタートメニュー: アプリを開く。シャットダウンは onLeave へ知らせる(PC から離れる)
 *
 * ダブルクリックは自分で数える(pointer lock の間は、ブラウザのクリック回数がカーソルの位置と合わないため)
 */
export const createShell = ({apps, now = () => performance.now()}: Options) => {
  const entries: StartMenuEntry[] = [
    ...apps.map((app) => ({kind: "app", appId: app.id}) as const),
    {kind: "separator"},
    {kind: "shutdown"},
  ];

  let state: ShellState = {
    windows: [],
    taskOrder: [],
    focused: null,
    selectedIcon: null,
    startOpen: false,
    hoveredEntry: null,
    pressed: null,
  };
  let version = 0;
  let nextId = 1;
  let drag: {windowId: number; dx: number; dy: number} | null = null;
  let captured: number | null = null;
  let lastIconClick: {appId: string; at: number; x: number; y: number} | null =
    null;
  const unsubscribes = new Map<number, () => void>();
  const listeners = new Set<() => void>();
  const leaveListeners = new Set<() => void>();

  const set = (patch: Partial<ShellState>) => {
    state = {...state, ...patch};
    bump();
  };
  const bump = () => {
    version++;
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  const windowOf = (id: number) => state.windows.find((w) => w.id === id);

  const topVisible = (windows: readonly ShellWindow[]): number | null =>
    windows.findLast((w) => !w.minimized)?.id ?? null;

  const focus = (id: number) => {
    const win = windowOf(id);
    if (!win) {
      return;
    }
    set({
      windows: [
        ...state.windows.filter((w) => w.id !== id),
        {...win, minimized: false},
      ],
      focused: id,
    });
  };

  const minimize = (id: number) => {
    const windows = state.windows.map((w) =>
      w.id === id ? {...w, minimized: true} : w,
    );
    set({
      windows,
      focused: state.focused === id ? topVisible(windows) : state.focused,
    });
  };

  const launch = (appId: string) => {
    const open = state.windows.find((w) => w.app.id === appId);
    if (open) {
      focus(open.id);
      return;
    }
    const app = apps.find((a) => a.id === appId);
    if (!app) {
      return;
    }
    const id = nextId++;
    const size = windowSizeFor(app.size);
    const view = app.open();
    const off = view.subscribe?.(bump);
    if (off) {
      unsubscribes.set(id, off);
    }
    set({
      windows: [
        ...state.windows,
        {
          id,
          app,
          view,
          rect: {...cascadePosition(size, state.windows.length), ...size},
          minimized: false,
        },
      ],
      taskOrder: [...state.taskOrder, id],
      focused: id,
    });
  };

  const close = (id: number) => {
    const win = windowOf(id);
    if (!win) {
      return;
    }
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
    win.view.dispose?.();
    if (captured === id) {
      captured = null;
    }
    const windows = state.windows.filter((w) => w.id !== id);
    set({
      windows,
      taskOrder: state.taskOrder.filter((t) => t !== id),
      focused: state.focused === id ? topVisible(windows) : state.focused,
    });
  };

  const activateEntry = (index: number) => {
    const entry = entries[index];
    set({startOpen: false, hoveredEntry: null});
    if (entry?.kind === "app") {
      launch(entry.appId);
    } else if (entry?.kind === "shutdown") {
      for (const l of Array.from(leaveListeners)) {
        l();
      }
    }
  };

  const entryAt = (x: number, y: number): number | null => {
    const index = startEntryRects(entries).findIndex((r) => contains(r, x, y));
    return index >= 0 && entries[index]?.kind !== "separator" ? index : null;
  };

  const pressedHits = (pressed: Pressed, x: number, y: number): boolean => {
    switch (pressed.kind) {
      case "start":
        return contains(START_BUTTON, x, y);
      case "startEntry":
        return entryAt(x, y) === pressed.index;
      case "task": {
        const i = state.taskOrder.indexOf(pressed.windowId);
        const rect = taskButtonRects(state.taskOrder.length)[i];
        return !!rect && contains(rect, x, y);
      }
      case "close":
      case "minimize": {
        const win = windowOf(pressed.windowId);
        const rect =
          win &&
          (pressed.kind === "close"
            ? closeButtonRect(win.rect)
            : minimizeButtonRect(win.rect));
        return !!rect && contains(rect, x, y);
      }
    }
  };

  const release = (pressed: Pressed) => {
    switch (pressed.kind) {
      case "close":
        close(pressed.windowId);
        return;
      case "minimize":
        minimize(pressed.windowId);
        return;
      case "task": {
        const win = windowOf(pressed.windowId);
        if (!win) {
          return;
        }
        if (!win.minimized && state.focused === win.id) {
          minimize(win.id);
        } else {
          focus(win.id);
        }
        return;
      }
      case "startEntry":
        activateEntry(pressed.index);
        return;
      case "start":
        return;
    }
  };

  const down = (x: number, y: number) => {
    if (state.startOpen) {
      if (contains(startMenuRect(entries), x, y)) {
        const index = entryAt(x, y);
        if (index !== null) {
          set({pressed: {kind: "startEntry", index}});
        }
        return;
      }
      // メニューの外を押したら閉じるだけ(押した先には届けない)
      set({startOpen: false, hoveredEntry: null});
      return;
    }

    if (contains(START_BUTTON, x, y)) {
      set({startOpen: true, pressed: {kind: "start"}, hoveredEntry: null});
      return;
    }

    const taskIndex = taskButtonRects(state.taskOrder.length).findIndex((r) =>
      contains(r, x, y),
    );
    const taskId = state.taskOrder[taskIndex];
    if (taskId !== undefined) {
      set({pressed: {kind: "task", windowId: taskId}});
      return;
    }

    const win = state.windows.findLast(
      (w) => !w.minimized && contains(w.rect, x, y),
    );
    if (win) {
      if (state.focused !== win.id || state.windows.at(-1)?.id !== win.id) {
        focus(win.id);
      }
      if (contains(closeButtonRect(win.rect), x, y)) {
        set({pressed: {kind: "close", windowId: win.id}});
      } else if (contains(minimizeButtonRect(win.rect), x, y)) {
        set({pressed: {kind: "minimize", windowId: win.id}});
      } else if (contains(titleBarRect(win.rect), x, y)) {
        drag = {windowId: win.id, dx: x - win.rect.x, dy: y - win.rect.y};
      } else {
        const client = clientRect(win.rect);
        if (contains(client, x, y)) {
          captured = win.id;
          win.view.pointer?.({
            type: "down",
            x: x - client.x,
            y: y - client.y,
            button: 0,
          });
        }
      }
      return;
    }

    const iconIndex = apps.findIndex((_, i) => contains(iconCellRect(i), x, y));
    const app = apps[iconIndex];
    if (app) {
      const at = now();
      const double =
        lastIconClick !== null &&
        lastIconClick.appId === app.id &&
        at - lastIconClick.at <= DOUBLE_CLICK_MS &&
        Math.abs(x - lastIconClick.x) <= DOUBLE_CLICK_SLOP &&
        Math.abs(y - lastIconClick.y) <= DOUBLE_CLICK_SLOP;
      lastIconClick = double ? null : {appId: app.id, at, x, y};
      set({selectedIcon: app.id, focused: null});
      if (double) {
        launch(app.id);
      }
      return;
    }

    lastIconClick = null;
    if (state.selectedIcon !== null || state.focused !== null) {
      set({selectedIcon: null, focused: null});
    }
  };

  const move = (x: number, y: number) => {
    if (drag) {
      const win = windowOf(drag.windowId);
      if (win) {
        const next = keepTitleVisible({
          ...win.rect,
          x: x - drag.dx,
          y: y - drag.dy,
        });
        if (next.x !== win.rect.x || next.y !== win.rect.y) {
          set({
            windows: state.windows.map((w) =>
              w.id === win.id ? {...w, rect: {...w.rect, ...next}} : w,
            ),
          });
        }
      }
      return;
    }
    if (captured !== null) {
      const win = windowOf(captured);
      if (win) {
        const client = clientRect(win.rect);
        win.view.pointer?.({
          type: "move",
          x: x - client.x,
          y: y - client.y,
          button: -1,
        });
      }
      return;
    }
    if (state.startOpen) {
      const hovered = entryAt(x, y);
      if (hovered !== state.hoveredEntry) {
        set({hoveredEntry: hovered});
      }
    }
  };

  const up = (x: number, y: number) => {
    drag = null;
    if (captured !== null) {
      const win = windowOf(captured);
      captured = null;
      if (win) {
        const client = clientRect(win.rect);
        win.view.pointer?.({
          type: "up",
          x: x - client.x,
          y: y - client.y,
          button: 0,
        });
      }
    }
    const {pressed} = state;
    if (!pressed) {
      return;
    }
    set({pressed: null});
    if (pressedHits(pressed, x, y)) {
      release(pressed);
    }
  };

  return {
    entries: entries as readonly StartMenuEntry[],
    apps,
    getState: (): ShellState => state,
    /** 状態が変わるたびに増える(描き直しの目安) */
    getVersion: (): number => version,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** スタートメニューのシャットダウン */
    onLeave: (listener: () => void): (() => void) => {
      leaveListeners.add(listener);
      return () => {
        leaveListeners.delete(listener);
      };
    },
    pointer: (event: ShellPointerEvent): void => {
      if (event.type === "move") {
        move(event.x, event.y);
      } else if (event.button !== 0) {
        return;
      } else if (event.type === "down") {
        down(event.x, event.y);
      } else {
        up(event.x, event.y);
      }
    },
    launch,
    close,
    /** PC から離れるとき。押しかけ・つかみかけ・開いたメニューを片付ける(窓はそのまま残す) */
    settle: (): void => {
      drag = null;
      captured = null;
      lastIconClick = null;
      if (state.startOpen || state.pressed || state.hoveredEntry !== null) {
        set({startOpen: false, pressed: null, hoveredEntry: null});
      }
    },
  };
};

export type Shell = ReturnType<typeof createShell>;
