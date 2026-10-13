import type {Rect} from "../kernel/geometry";
import {
  clientRect,
  closeButtonRect,
  ICON_SIZE,
  iconCellRect,
  minimizeButtonRect,
  SCREEN,
  START_BUTTON,
  START_MENU_BANNER,
  startEntryRects,
  startMenuRect,
  TASKBAR,
  taskButtonRects,
  titleBarRect,
  TRAY,
} from "../kernel/layout";
import type {Shell, ShellWindow} from "../kernel/shell";
import {COLORS, FONT, FONT_BANNER, FONT_BOLD} from "../theme/classic";
import {paintIcon} from "../theme/icons";
import {raised, sunkenThin} from "./bevel";

export const paintShell = (
  ctx: CanvasRenderingContext2D,
  shell: Shell,
  now: Date,
): void => {
  const state = shell.getState();
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.desktop;
  ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);

  shell.apps.forEach((app, i) => {
    paintDesktopIcon(
      ctx,
      iconCellRect(i),
      app.icon,
      app.title,
      state.selectedIcon === app.id,
    );
  });

  for (const win of state.windows) {
    if (!win.minimized) {
      paintWindow(ctx, win, state.focused === win.id, state.pressed);
    }
  }

  paintTaskbar(ctx, shell, now);
  if (state.startOpen) {
    paintStartMenu(ctx, shell);
  }
  ctx.restore();
};

const paintDesktopIcon = (
  ctx: CanvasRenderingContext2D,
  cell: Rect,
  icon: Parameters<typeof paintIcon>[1],
  label: string,
  selected: boolean,
): void => {
  const iconX = cell.x + Math.round((cell.width - ICON_SIZE) / 2);
  const iconY = cell.y + 2;
  paintIcon(ctx, icon, iconX, iconY, 32, selected ? COLORS.selection : null);

  ctx.font = FONT;
  const width = Math.min(cell.width - 2, ctx.measureText(label).width + 4);
  const labelRect = {
    x: cell.x + Math.round((cell.width - width) / 2),
    y: iconY + ICON_SIZE + 3,
    width: Math.round(width),
    height: 15,
  };
  if (selected) {
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
  }
  ctx.fillStyle = selected ? COLORS.selectionText : COLORS.desktopText;
  ctx.textAlign = "center";
  ctx.fillText(
    label,
    labelRect.x + labelRect.width / 2,
    labelRect.y + labelRect.height / 2 + 1,
    cell.width - 4,
  );
  ctx.textAlign = "left";
};

const paintWindow = (
  ctx: CanvasRenderingContext2D,
  win: ShellWindow,
  active: boolean,
  pressed: ReturnType<Shell["getState"]>["pressed"],
): void => {
  raised(ctx, win.rect);

  const title = titleBarRect(win.rect);
  const [from, to] = active ? COLORS.activeTitle : COLORS.inactiveTitle;
  const gradient = ctx.createLinearGradient(
    title.x,
    0,
    title.x + title.width,
    0,
  );
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(title.x, title.y, title.width, title.height);

  paintIcon(ctx, win.app.icon, title.x + 2, title.y + 1, 16);
  ctx.font = FONT_BOLD;
  ctx.fillStyle = active ? COLORS.activeTitleText : COLORS.inactiveTitleText;
  ctx.fillText(
    win.app.title,
    title.x + 21,
    title.y + title.height / 2 + 1,
    title.width - 21 - 40,
  );

  const minimize = minimizeButtonRect(win.rect);
  const close = closeButtonRect(win.rect);
  const isPressed = (kind: "close" | "minimize") =>
    pressed?.kind === kind && pressed.windowId === win.id;
  raised(ctx, minimize, isPressed("minimize"));
  raised(ctx, close, isPressed("close"));
  ctx.fillStyle = COLORS.text;
  const m = isPressed("minimize") ? 1 : 0;
  ctx.fillRect(minimize.x + 4 + m, minimize.y + 9 + m, 6, 2);
  paintCross(ctx, close, isPressed("close") ? 1 : 0);

  const client = clientRect(win.rect);
  ctx.save();
  ctx.beginPath();
  ctx.rect(client.x, client.y, client.width, client.height);
  ctx.clip();
  ctx.translate(client.x, client.y);
  ctx.fillStyle = COLORS.face;
  ctx.fillRect(0, 0, client.width, client.height);
  ctx.font = FONT;
  ctx.fillStyle = COLORS.text;
  win.view.paint(ctx, {width: client.width, height: client.height});
  ctx.restore();
};

const paintCross = (
  ctx: CanvasRenderingContext2D,
  button: Rect,
  offset: number,
): void => {
  const x = button.x + 4 + offset;
  const y = button.y + 3 + offset;
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(x + i, y + i, 2, 1);
    ctx.fillRect(x + 6 - i, y + i, 2, 1);
  }
};

const paintTaskbar = (
  ctx: CanvasRenderingContext2D,
  shell: Shell,
  now: Date,
): void => {
  const state = shell.getState();
  ctx.fillStyle = COLORS.face;
  ctx.fillRect(TASKBAR.x, TASKBAR.y, TASKBAR.width, TASKBAR.height);
  ctx.fillStyle = COLORS.highlight;
  ctx.fillRect(TASKBAR.x, TASKBAR.y + 1, TASKBAR.width, 1);

  const startDown = state.startOpen || state.pressed?.kind === "start";
  raised(ctx, START_BUTTON, startDown);
  const o = startDown ? 1 : 0;
  paintIcon(ctx, "start", START_BUTTON.x + 4 + o, START_BUTTON.y + 3 + o, 16);
  ctx.font = FONT_BOLD;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(
    "スタート",
    START_BUTTON.x + 23 + o,
    START_BUTTON.y + START_BUTTON.height / 2 + 1 + o,
  );

  const rects = taskButtonRects(state.taskOrder.length);
  state.taskOrder.forEach((id, i) => {
    const win = state.windows.find((w) => w.id === id);
    const rect = rects[i];
    if (!win || !rect) {
      return;
    }
    const down =
      (!win.minimized && state.focused === id) ||
      (state.pressed?.kind === "task" && state.pressed.windowId === id);
    raised(ctx, rect, down);
    if (down && !win.minimized && state.focused === id) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
      ctx.clip();
      ctx.fillStyle = COLORS.highlight;
      for (let y = rect.y + 2; y < rect.y + rect.height - 2; y++) {
        for (
          let x = rect.x + 2 + (y % 2);
          x < rect.x + rect.width - 2;
          x += 2
        ) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.restore();
    }
    const d = down ? 1 : 0;
    paintIcon(ctx, win.app.icon, rect.x + 4 + d, rect.y + 3 + d, 16);
    ctx.font = down && state.focused === id ? FONT_BOLD : FONT;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(
      win.app.title,
      rect.x + 24 + d,
      rect.y + rect.height / 2 + 1 + d,
      rect.width - 28,
    );
  });

  sunkenThin(ctx, TRAY);
  ctx.font = FONT;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = "center";
  ctx.fillText(
    `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
    TRAY.x + TRAY.width / 2,
    TRAY.y + TRAY.height / 2 + 1,
  );
  ctx.textAlign = "left";
};

const paintStartMenu = (ctx: CanvasRenderingContext2D, shell: Shell): void => {
  const state = shell.getState();
  const menu = startMenuRect(shell.entries);
  raised(ctx, menu);

  const banner = {
    x: menu.x + 3,
    y: menu.y + 3,
    width: START_MENU_BANNER - 2,
    height: menu.height - 6,
  };
  const [top, bottom] = COLORS.banner;
  const gradient = ctx.createLinearGradient(
    0,
    banner.y + banner.height,
    0,
    banner.y,
  );
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(banner.x, banner.y, banner.width, banner.height);
  ctx.save();
  ctx.translate(banner.x + banner.width / 2 + 1, banner.y + banner.height - 6);
  ctx.rotate(-Math.PI / 2);
  ctx.font = FONT_BANNER;
  ctx.fillStyle = COLORS.highlight;
  ctx.fillText("IUBEO", 0, 0);
  ctx.restore();

  const rects = startEntryRects(shell.entries);
  shell.entries.forEach((entry, i) => {
    const rect = rects[i];
    if (!rect) {
      return;
    }
    const hovered = state.hoveredEntry === i;
    if (hovered) {
      ctx.fillStyle = COLORS.selection;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    const app = shell.apps.find((a) => a.id === entry.appId);
    if (!app) {
      return;
    }
    paintIcon(
      ctx,
      app.icon,
      rect.x + 4,
      rect.y + Math.round((rect.height - 16) / 2),
      16,
    );
    ctx.font = FONT;
    ctx.fillStyle = hovered ? COLORS.selectionText : COLORS.text;
    ctx.fillText(
      app.title,
      rect.x + 28,
      rect.y + rect.height / 2 + 1,
      rect.width - 32,
    );
  });
};
