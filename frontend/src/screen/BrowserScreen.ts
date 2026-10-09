import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import {
  type AddressEdit,
  addressDraftFor,
  applyAddressKey,
  applyAddressText,
  CONTENT_HEIGHT,
  displayUrl,
  hitToolbar,
  normalizeAddress,
  SCREEN_CANVAS,
  TOOLBAR_HEIGHT,
  TOOLBAR_LAYOUT,
} from "./browserChrome";
import {GeckoSource} from "./GeckoSource";
import type {
  CursorKind,
  ScreenKeyEvent,
  ScreenModifiers,
  ScreenPointerEvent,
  ScreenSource,
  ScreenStatus,
} from "./types";

/** URL を読み直す間隔(ms)。クリックでのリンク移動もここで拾う */
const URL_SYNC_MS = 500;
/** 自分で移動した直後の、URL を読み直さない時間(ms)。読み込みが済む前に古い URL へ戻らないため */
const NAVIGATION_HOLD_MS = 10000;

const MONO = "ui-monospace, Menlo, Consolas, monospace";
const COLORS = {
  chrome: "#e6e6e2",
  chromeLine: "#c9c9c4",
  button: "#fafaf8",
  ink: "#1d1d1f",
  muted: "#8e8e93",
  focus: "#4a7bd8",
  field: "#ffffff",
  select: "#aacbf3",
};

/**
 * PC の画面（テクスチャに貼る 1 枚）。上にブラウザの枠（戻る・進む・アドレスバー）、下にエンジンの表示を
 * 合成する。枠は HUD ではなく、画面の一部として描く。
 *
 * 入力は、枠の上なら枠が受け取り、それ以外はエンジンへ（座標は枠の分だけずらす）。
 * アドレス欄にフォーカスがある間の文字入力は、アドレス欄へ入る（エンジンには送らない）。
 */
export class BrowserScreen implements ScreenSource {
  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: GeckoSource;

  private dirty = true;
  private chromeDirty = true;
  /** 今表示している URL（枠に出す値） */
  private url = "";
  /**
   * 訪問の履歴。エンジンの load は履歴を積まないので、戻る・進むはここで持つ。
   * リンクのクリックで移動したときは、URL の読み直しで足す
   */
  private history: string[] = [];
  private historyIndex = -1;
  /** 自分で移動を始めた先の URL。読み込みが済むまで、読み直した古い URL で上書きしない */
  private pendingUrl: string | null = null;
  private holdUntil = 0;
  /**
   * 移動を始めたときに表示していたページの URL。これと違う URL が読めたら、移動先に着いたとみなす
   * （リダイレクトで入力と違う URL に着いたときのため）。まだ一度も読めていなければ空
   */
  private navigatedFrom = "";
  /** 最後に読んだ、表示中のページの URL */
  private lastHref = "";
  /** ページの中で押したボタンを離すまでの間。枠の上へはみ出しても、離すまでエンジンへ送る */
  private pagePressed = false;
  private addressFocused = false;
  /** アドレス欄の編集状態（入力中の文字列と、全選択かどうか） */
  private address: AddressEdit = {text: "", selectAll: false};
  private readonly syncTimer: number;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SCREEN_CANVAS.width;
    this.canvas.height = SCREEN_CANVAS.height;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;

    this.engine = new GeckoSource(
      SCREEN_CANVAS.width,
      CONTENT_HEIGHT,
      location.search,
    );
    this.syncTimer = window.setInterval(() => void this.syncUrl(), URL_SYNC_MS);
  }

  get width(): number {
    return SCREEN_CANVAS.width;
  }

  get height(): number {
    return SCREEN_CANVAS.height;
  }

  get status(): ScreenStatus {
    return this.engine.status;
  }

  get statusDetail(): string {
    return this.engine.statusDetail;
  }

  /** 今表示しているページの URL（枠に出している値。読み直しで更新される） */
  get currentUrl(): string {
    return this.url;
  }

  get canGoBack(): boolean {
    return this.historyIndex > 0;
  }

  get canGoForward(): boolean {
    return (
      this.historyIndex >= 0 && this.historyIndex < this.history.length - 1
    );
  }

  get liveSurface(): boolean {
    return this.engine.liveSurface === true;
  }

  boot(): Promise<void> {
    return this.engine.boot();
  }

  pointer(event: ScreenPointerEvent): void {
    // 離した通知を取りこぼしても（押したまま PC から離れたなど）、ボタンが押されていなければ押下は終わっている
    if (event.type !== "up" && event.buttons === 0) {
      this.pagePressed = false;
    }
    if (event.y < TOOLBAR_HEIGHT && !this.pagePressed) {
      if (event.type === "down") {
        this.pressToolbar(event.x, event.y);
      }
      return;
    }
    if (event.type === "down") {
      this.blurAddress();
      this.pagePressed = true;
    } else if (event.type === "up") {
      this.pagePressed = false;
    }
    this.engine.pointer({...event, y: event.y - TOOLBAR_HEIGHT});
  }

  wheel(
    dx: number,
    dy: number,
    x: number,
    y: number,
    modifiers: ScreenModifiers,
  ): void {
    if (y < TOOLBAR_HEIGHT) {
      return;
    }
    this.engine.wheel(dx, dy, x, y - TOOLBAR_HEIGHT, modifiers);
  }

  key(event: ScreenKeyEvent): void {
    if (!this.addressFocused) {
      this.engine.key(event);
      return;
    }
    if (event.type !== "down") {
      return;
    }
    if (event.key === "Enter") {
      this.submitAddress();
      return;
    }
    if (event.key === "Escape") {
      this.blurAddress();
      return;
    }
    const next = applyAddressKey(this.address, event);
    if (next !== this.address) {
      this.address = next;
      this.markChrome();
    }
  }

  insertText(text: string): void {
    if (!this.addressFocused) {
      this.engine.insertText(text);
      return;
    }
    this.address = applyAddressText(this.address, text);
    this.markChrome();
  }

  /** Escape は、アドレス欄を編集中なら編集を取り消すだけにする（PC から離れるのは、そのとき以外） */
  escapeIsLocal(): boolean {
    return this.addressFocused;
  }

  tick(): void {
    this.engine.tick();
    if (this.engine.liveSurface || this.engine.isDirty() || this.chromeDirty) {
      this.compose();
      this.engine.clearDirty();
      this.chromeDirty = false;
      this.dirty = true;
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  cursorKind(x: number, y: number): CursorKind {
    if (y < TOOLBAR_HEIGHT) {
      return hitToolbar(x, y) === "address" ? "text" : "default";
    }
    return this.engine.cursorKind(x, y - TOOLBAR_HEIGHT);
  }

  dispose(): void {
    window.clearInterval(this.syncTimer);
    this.engine.dispose();
    this.texture.dispose();
  }

  private markChrome(): void {
    this.chromeDirty = true;
  }

  private pressToolbar(x: number, y: number): void {
    const part = hitToolbar(x, y);
    if (part === "back" && this.canGoBack) {
      this.blurAddress();
      this.moveInHistory(this.historyIndex - 1);
    } else if (part === "forward" && this.canGoForward) {
      this.blurAddress();
      this.moveInHistory(this.historyIndex + 1);
    } else if (part === "address") {
      this.focusAddress();
    }
  }

  /** 履歴の位置へ移る（戻る・進む） */
  private moveInHistory(index: number): void {
    const target = this.history[index];
    if (!target) {
      return;
    }
    this.historyIndex = index;
    this.url = target;
    this.startNavigation(target);
  }

  /** 移動を始める。読み込みが済むまでは、読み直した URL で上書きしない */
  private startNavigation(target: string): void {
    this.engine.navigate(target);
    this.pendingUrl = target;
    this.navigatedFrom = this.lastHref;
    this.holdUntil = Date.now() + NAVIGATION_HOLD_MS;
    this.markChrome();
  }

  /** 訪問を履歴に足す。今の位置より先の履歴は捨てる（ブラウザと同じ） */
  private recordVisit(url: string): void {
    if (this.history[this.historyIndex] === url) {
      return;
    }
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(url);
    this.historyIndex = this.history.length - 1;
  }

  private focusAddress(): void {
    this.addressFocused = true;
    this.address = {text: addressDraftFor(this.url), selectAll: false};
    this.markChrome();
  }

  private blurAddress(): void {
    if (!this.addressFocused) {
      return;
    }
    this.addressFocused = false;
    this.address = {text: "", selectAll: false};
    this.markChrome();
  }

  private submitAddress(): void {
    const target = normalizeAddress(this.address.text);
    this.blurAddress();
    if (!target) {
      return;
    }
    this.url = target;
    this.recordVisit(target);
    this.startNavigation(target);
  }

  /** 表示中のページの URL を読み、枠と履歴を合わせる（クリックでのリンク移動もここで拾う） */
  private async syncUrl(): Promise<void> {
    if (this.addressFocused) {
      return;
    }
    const href = await this.engine.evalContent("location.href");
    if (!href) {
      return;
    }
    this.lastHref = href;
    if (this.pendingUrl !== null) {
      // 自分で始めた移動の結果を待つ。移動先か、移動前と違うページ（リダイレクトの後など）が来たら、
      // それを今の URL として採る
      const arrived =
        href === this.pendingUrl ||
        (!!this.navigatedFrom && href !== this.navigatedFrom);
      if (arrived || Date.now() >= this.holdUntil) {
        // 履歴には入力どおりの URL を積んでいるので、着いた先の URL に直す（リンクで先へ進んだときに重複させない）
        if (arrived && this.history[this.historyIndex] === this.pendingUrl) {
          this.history[this.historyIndex] = href;
        }
        this.pendingUrl = null;
        this.navigatedFrom = "";
        this.url = href;
        this.markChrome();
      }
      return;
    }
    if (href !== this.url) {
      this.url = href;
      this.recordVisit(href);
      this.markChrome();
    }
  }

  /** 枠とエンジンの表示を、1 枚の画面に合成する */
  private compose(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.fillStyle = COLORS.chrome;
    ctx.fillRect(0, 0, SCREEN_CANVAS.width, TOOLBAR_HEIGHT);
    ctx.fillStyle = COLORS.chromeLine;
    ctx.fillRect(0, TOOLBAR_HEIGHT - 2, SCREEN_CANVAS.width, 2);

    drawButton(ctx, "back", this.canGoBack);
    drawButton(ctx, "forward", this.canGoForward);
    this.drawAddress(ctx);

    ctx.drawImage(this.engine.canvas, 0, TOOLBAR_HEIGHT);
  }

  private drawAddress(ctx: CanvasRenderingContext2D): void {
    const r = TOOLBAR_LAYOUT.address;
    const focused = this.addressFocused;
    roundRect(ctx, r.x, r.y, r.width, r.height, 18);
    ctx.fillStyle = COLORS.field;
    ctx.fill();
    ctx.strokeStyle = focused ? COLORS.focus : COLORS.chromeLine;
    ctx.lineWidth = focused ? 3 : 2;
    ctx.stroke();

    const padding = 16;
    const maxWidth = r.width - padding * 2;
    ctx.font = `20px ${MONO}`;
    ctx.textBaseline = "middle";
    const cy = r.y + r.height / 2;

    if (focused) {
      const text = fitTail(ctx, this.address.text, maxWidth);
      if (this.address.selectAll && text) {
        ctx.fillStyle = COLORS.select;
        ctx.fillRect(
          r.x + padding,
          r.y + 6,
          ctx.measureText(text).width,
          r.height - 12,
        );
      }
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(text, r.x + padding, cy);
      if (!this.address.selectAll) {
        const caret = r.x + padding + ctx.measureText(text).width + 2;
        ctx.fillRect(caret, cy - 11, 2, 22);
      }
      return;
    }
    if (!this.url) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `20px sans-serif`;
      ctx.fillText("アドレスまたは検索語を入力", r.x + padding, cy);
      return;
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(
      fitHead(ctx, displayUrl(this.url), maxWidth),
      r.x + padding,
      cy,
    );
  }
}

/** 戻る・進むのボタン。矢印は図形で描く（フォントに依らない） */
const drawButton = (
  ctx: CanvasRenderingContext2D,
  part: "back" | "forward",
  enabled: boolean,
): void => {
  const r = TOOLBAR_LAYOUT[part];
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const dir = part === "back" ? -1 : 1;
  roundRect(ctx, r.x, r.y, r.width, r.height, 8);
  ctx.fillStyle = COLORS.button;
  ctx.fill();
  ctx.strokeStyle = COLORS.chromeLine;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  // 先端は進む向き（戻るは左）に出し、底辺はその反対側に置く
  ctx.moveTo(cx + dir * 6, cy);
  ctx.lineTo(cx - dir * 5, cy - 8);
  ctx.lineTo(cx - dir * 5, cy + 8);
  ctx.closePath();
  ctx.fillStyle = enabled ? COLORS.ink : COLORS.muted;
  ctx.fill();
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

/** 入りきらない分を先頭から省く（打っている末尾を見せる） */
const fitTail = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  let shown = text;
  while (shown && ctx.measureText(shown).width > maxWidth) {
    shown = shown.slice(1);
  }
  return shown;
};

/** 入りきらない分を末尾から「…」で省く（読むのは先頭） */
const fitHead = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let shown = text;
  while (shown && ctx.measureText(`${shown}…`).width > maxWidth) {
    shown = shown.slice(0, -1);
  }
  return `${shown}…`;
};
