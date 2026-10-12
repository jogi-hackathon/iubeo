import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import type {
  CursorKind,
  ScreenKeyEvent,
  ScreenModifiers,
  ScreenPointerEvent,
  ScreenSource,
  ScreenStatus,
} from "../display/types";
import type {DesktopApp} from "./kernel/app";
import type {Point} from "./kernel/geometry";
import {SCREEN} from "./kernel/layout";
import {createShell, type Shell} from "./kernel/shell";
import {paintCursor} from "./paint/cursor";
import {paintShell} from "./paint/shell";

/**
 * 2000 風のデスクトップを映す画面のソース。シェルの絵を下地(base)に描いておき、
 * カーソルが動いただけのときは下地を写してカーソルを重ねるだけにする。
 * キーボードは使わない(PC から離れるのは、右クリック・Esc・スタートメニューのシャットダウン)
 */
export class DesktopScreen implements ScreenSource {
  readonly texture: CanvasTexture;
  readonly shell: Shell;
  readonly status: ScreenStatus = "ready";
  readonly statusDetail = "";

  private readonly canvas: HTMLCanvasElement;
  private readonly base: HTMLCanvasElement;
  private cursor: Point = {x: SCREEN.width / 2, y: SCREEN.height / 2};
  private paintedVersion = -1;
  private paintedMinute = -1;
  private cursorMoved = true;
  private dirty = true;
  private readonly now: () => Date;

  constructor(apps: readonly DesktopApp[], now: () => Date = () => new Date()) {
    this.now = now;
    this.shell = createShell({apps});
    this.canvas = document.createElement("canvas");
    this.canvas.width = SCREEN.width;
    this.canvas.height = SCREEN.height;
    this.base = document.createElement("canvas");
    this.base.width = SCREEN.width;
    this.base.height = SCREEN.height;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
    // 一度も描いていない canvas を GPU へ上げると Chrome が転送を飛ばすので、先に 1 回描く(BrowserScreen と同じ)
    this.tick();
  }

  get width(): number {
    return SCREEN.width;
  }

  get height(): number {
    return SCREEN.height;
  }

  /** dev の確認ページが、画面の canvas をそのまま並べるために使う */
  get surface(): HTMLCanvasElement {
    return this.canvas;
  }

  boot(): Promise<void> {
    return Promise.resolve();
  }

  pointer(event: ScreenPointerEvent): void {
    if (event.x !== this.cursor.x || event.y !== this.cursor.y) {
      this.cursor = {x: event.x, y: event.y};
      this.cursorMoved = true;
    }
    this.shell.pointer({
      type: event.type,
      x: Math.floor(event.x),
      y: Math.floor(event.y),
      button: event.button,
    });
  }

  wheel(
    _dx: number,
    _dy: number,
    _x: number,
    _y: number,
    _modifiers: ScreenModifiers,
  ): void {}

  key(_event: ScreenKeyEvent): void {}

  insertText(_text: string): void {}

  tick(): void {
    const now = this.now();
    const minute = now.getHours() * 60 + now.getMinutes();
    const version = this.shell.getVersion();
    const baseChanged =
      version !== this.paintedVersion || minute !== this.paintedMinute;
    if (baseChanged) {
      const ctx = this.base.getContext("2d");
      if (ctx) {
        paintShell(ctx, this.shell, now);
      }
      this.paintedVersion = version;
      this.paintedMinute = minute;
    }
    if (baseChanged || this.cursorMoved) {
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(this.base, 0, 0);
        paintCursor(ctx, this.cursor.x, this.cursor.y);
      }
      this.cursorMoved = false;
      this.dirty = true;
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  cursorKind(_x: number, _y: number): CursorKind {
    return "default";
  }

  dispose(): void {
    this.texture.dispose();
  }
}
