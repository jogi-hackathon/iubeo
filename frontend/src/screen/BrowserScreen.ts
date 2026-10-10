import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import type {PageSnapshot} from "../judge/types";
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

const URL_SYNC_MS = 500;
const NAVIGATION_HOLD_MS = 10000;
const TEAR_MS = 700;
const TEAR_SLICES = 12;
const TEAR_SHIFT = 0.05;

const MONO = "ui-monospace, Menlo, Consolas, monospace";
const JA_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
const COLORS = {
  chrome: "#e6e6e2",
  chromeLine: "#c9c9c4",
  button: "#fafaf8",
  ink: "#1d1d1f",
  muted: "#8e8e93",
  focus: "#4a7bd8",
  field: "#ffffff",
  select: "#aacbf3",
  notice: "rgba(28, 28, 30, 0.86)",
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
  private url = "";
  private history: string[] = [];
  private historyIndex = -1;
  private pendingUrl: string | null = null;
  private holdUntil = 0;
  private navigatedFrom = "";
  private lastHref = "";
  private pagePressed = false;
  private addressFocused = false;
  private address: AddressEdit = {text: "", selectAll: false};
  private notice: readonly string[] | null = null;
  private tearUntil = 0;
  /** 表示中のページが変わったときに呼ぶ（Web Search の常時判定のきっかけ） */
  onPageChange?: (url: string) => void;
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

  async readPage(): Promise<PageSnapshot | null> {
    const url = this.url || this.lastHref;
    const title = (await this.engine.evalContent("document.title")) ?? "";
    const text =
      (await this.engine.evalContent(
        "document.body && document.body.innerText ? document.body.innerText : ''",
      )) ?? "";
    return url || title || text ? {url, title, text} : null;
  }

  /**
   * 画面の中に通知を出す。同じ内容なら描き直さない（毎フレーム呼ばれても無駄に描かない）。
   * tear を立てると、少しの間だけ走査が乱れる（彼らの介入）
   */
  setNotice(lines: readonly string[] | null, tear = false): void {
    if (tear && lines) {
      this.tearUntil = performance.now() + TEAR_MS;
    }
    if (sameNotice(this.notice, lines)) {
      this.markChrome();
      return;
    }
    this.notice = lines;
    this.markChrome();
  }

  tick(): void {
    this.engine.tick();
    const tearing = performance.now() < this.tearUntil;
    if (
      this.engine.liveSurface ||
      this.engine.isDirty() ||
      this.chromeDirty ||
      tearing
    ) {
      this.compose(tearing);
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

  private moveInHistory(index: number): void {
    const target = this.history[index];
    if (!target) {
      return;
    }
    this.historyIndex = index;
    this.url = target;
    this.startNavigation(target);
  }

  private startNavigation(target: string): void {
    this.engine.navigate(target);
    this.pendingUrl = target;
    this.navigatedFrom = this.lastHref;
    this.holdUntil = Date.now() + NAVIGATION_HOLD_MS;
    this.markChrome();
  }

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
      const arrived =
        href === this.pendingUrl ||
        (!!this.navigatedFrom && href !== this.navigatedFrom);
      if (arrived || Date.now() >= this.holdUntil) {
        if (arrived && this.history[this.historyIndex] === this.pendingUrl) {
          this.history[this.historyIndex] = href;
        }
        this.pendingUrl = null;
        this.navigatedFrom = "";
        this.url = href;
        this.markChrome();
        this.notifyPageChange();
      }
      return;
    }
    if (href !== this.url) {
      this.url = href;
      this.recordVisit(href);
      this.markChrome();
      this.notifyPageChange();
    }
  }

  private notifyPageChange(): void {
    this.onPageChange?.(this.url);
  }

  private compose(tearing = false): void {
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

    drawEngine(ctx, this.engine.canvas, tearing);
    this.drawNotice(ctx);
  }

  private drawNotice(ctx: CanvasRenderingContext2D): void {
    const lines = this.notice;
    if (!lines || lines.length === 0) {
      return;
    }
    const padding = 16;
    const lineHeight = 26;
    const r = {
      x: padding,
      y: 0,
      width: SCREEN_CANVAS.width - padding * 2,
      height: lines.length * lineHeight + padding * 2 - 6,
    };
    r.y = SCREEN_CANVAS.height - padding - r.height;

    roundRect(ctx, r.x, r.y, r.width, r.height, 10);
    ctx.fillStyle = COLORS.notice;
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `20px ${JA_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxWidth = r.width - padding * 2;
    lines.forEach((line, index) => {
      ctx.fillText(
        fitHead(ctx, line, maxWidth),
        r.x + padding,
        r.y + padding + lineHeight * index + lineHeight / 2 - 3,
      );
    });
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

const drawEngine = (
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  tearing: boolean,
): void => {
  if (!tearing) {
    ctx.drawImage(source, 0, TOOLBAR_HEIGHT);
    return;
  }
  const slice = source.height / TEAR_SLICES;
  for (let index = 0; index < TEAR_SLICES; index += 1) {
    const weight = index % 3 === 0 ? 1 : 0.35;
    const shift =
      (Math.random() - 0.5) * 2 * TEAR_SHIFT * SCREEN_CANVAS.width * weight;
    ctx.drawImage(
      source,
      0,
      index * slice,
      source.width,
      slice,
      shift,
      TOOLBAR_HEIGHT + index * slice,
      SCREEN_CANVAS.width,
      slice,
    );
  }
};

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

const sameNotice = (
  a: readonly string[] | null,
  b: readonly string[] | null,
): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every((line, index) => line === b[index]));
