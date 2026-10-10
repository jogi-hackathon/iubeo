import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import {
  type CursorKind,
  type ScreenKeyEvent,
  type ScreenModifiers,
  type ScreenPointerEvent,
  type ScreenSource,
  type ScreenStatus,
  SYNTHETIC_KEY,
} from "./types";

/**
 * 「ブラウザを 1 枚の canvas に描き、それをテクスチャとして読む」ための基底クラス。
 *
 * 正しさに関わる点が 2 つある:
 *
 *  1. canvas はレイアウトされ、フォーカス可能な状態のままにしておく必要がある。エンジンは canvas 自身に
 *     リスナーを付け、mousedown で `canvas.focus()` を呼ぶ。`display: none` ではなく画面外へ追い出し、
 *     実際の画素サイズを保つ（`opacity: 0` で見えなくする）。
 *  2. CSS サイズとバッキングストアのサイズを一致させること。エンジンはクライアント座標を
 *     canvas 画素へ `(clientX - rect.left) * (W / rect.width)` で変換するため、CSS で拡大縮小していると
 *     すべてのクリックが静かにずれる。
 */
export abstract class CanvasScreenSource implements ScreenSource {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;

  status: ScreenStatus = "idle";
  statusDetail = "";

  protected dirty = true;
  protected disposed = false;
  private readonly frame: HTMLDivElement;

  constructor(width: number, height: number, canvasId: string) {
    const frame = document.createElement("div");
    frame.style.cssText = [
      "position:fixed",
      "left:-20000px",
      "top:0",
      "opacity:0",
      "pointer-events:none",
      "z-index:-1",
      "contain:strict",
    ].join(";");
    frame.setAttribute("aria-hidden", "true");
    this.frame = frame;

    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = "block";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.setAttribute("tabindex", "-1");
    this.canvas = canvas;

    frame.appendChild(canvas);
    document.body.appendChild(frame);

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  protected setStatus(status: ScreenStatus, detail = ""): void {
    this.status = status;
    this.statusDetail = detail;
    this.paintNotice();
    this.markDirty();
  }

  protected paintNotice(): void {
    if (this.status === "ready") {
      return;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const lines = noticeLines(this.status, this.statusDetail);
    ctx.fillStyle = "#06120c";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#8fe3b0";
    ctx.textBaseline = "top";
    lines.forEach((line, index) => {
      ctx.font =
        index === 0 ? "bold 40px monospace" : "26px monospace, sans-serif";
      ctx.fillText(line, 48, 96 + index * 48, this.canvas.width - 96);
    });
  }

  markDirty(): void {
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  tick(): void {}

  cursorKind(_x: number, _y: number): CursorKind {
    return "default";
  }

  protected dispatchPointer(event: ScreenPointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const type =
      event.type === "down"
        ? "mousedown"
        : event.type === "up"
          ? "mouseup"
          : "mousemove";
    this.canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + event.x,
        clientY: rect.top + event.y,
        screenX: rect.left + event.x,
        screenY: rect.top + event.y,
        button: event.button,
        buttons: event.buttons,
        detail: event.clickCount,
        ...event.modifiers,
      }),
    );
  }

  protected dispatchWheel(
    dx: number,
    dy: number,
    x: number,
    y: number,
    modifiers: ScreenModifiers,
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        deltaX: dx,
        deltaY: dy,
        deltaMode: 0,
        ...modifiers,
      }),
    );
  }

  protected dispatchKey(event: ScreenKeyEvent): void {
    const domEvent = new KeyboardEvent(
      event.type === "down" ? "keydown" : "keyup",
      {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: event.key,
        ...event.modifiers,
      },
    );
    // keyCode / charCode はレガシーで KeyboardEventInit の型からは弾かれるが、エンジンは今でも読む
    Object.defineProperty(domEvent, "keyCode", {
      value: event.keyCode,
      configurable: true,
    });
    Object.defineProperty(domEvent, "charCode", {
      value: event.charCode,
      configurable: true,
    });
    Object.defineProperty(domEvent, "which", {
      value: event.keyCode,
      configurable: true,
    });
    Object.defineProperty(domEvent, SYNTHETIC_KEY, {
      value: true,
      configurable: true,
    });
    this.canvas.dispatchEvent(domEvent);
  }

  abstract boot(): Promise<void>;

  pointer(_event: ScreenPointerEvent): void {}
  wheel(
    _dx: number,
    _dy: number,
    _x: number,
    _y: number,
    _modifiers: ScreenModifiers,
  ): void {}
  key(_event: ScreenKeyEvent): void {}
  insertText(_text: string): void {}

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
    this.frame.remove();
  }
}

const noticeLines = (status: ScreenStatus, detail: string): string[] => {
  switch (status) {
    case "booting":
      return ["BOOTING", detail || "エンジンを起動しています"];
    case "unavailable":
      return [
        "NO ENGINE",
        detail || "pnpm engine:link でエンジンを取り込んでください",
      ];
    case "error":
      return ["ENGINE ERROR", detail];
    default:
      return ["", detail];
  }
};
