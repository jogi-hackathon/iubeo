import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import type {PageSnapshot} from "../../../../judge/types";
import {SCREEN_CANVAS} from "../../display/resolution";
import type {
  CursorKind,
  ScreenCaret,
  ScreenKeyEvent,
  ScreenModifiers,
  ScreenPointerEvent,
  ScreenSource,
  ScreenStatus,
} from "../../display/types";
import {
  type AddressEdit,
  addressDraftFor,
  addressEditOf,
  addressSelection,
  applyAddressKey,
  applyAddressText,
  CONTENT_HEIGHT,
  moveAddressCaret,
  selectAddressWord,
  selectedAddressText,
  displayUrl,
  hitToolbar,
  normalizeAddress,
  TOOLBAR_HEIGHT,
  TOOLBAR_LAYOUT,
} from "./browserChrome";
import {GeckoSource} from "./GeckoSource";

const URL_SYNC_MS = 500;
const NAVIGATION_HOLD_MS = 10000;
const TEAR_MS = 700;
const TEAR_SLICES = 12;
const TEAR_SHIFT = 0.05;
const ADDRESS_PADDING = 16;

/** ページで選んでいる文字。入力欄の中の選択は getSelection() に出ないので、先に見る */
const PAGE_SELECTION = `(() => {
  const el = document.activeElement;
  if (el && typeof el.selectionStart === "number" && typeof el.value === "string") {
    return el.value.slice(el.selectionStart, el.selectionEnd);
  }
  return String(getSelection() || "");
})()`;

const PAGE_CARET = `(() => {
  const el = document.activeElement;
  const out = (x, y, height) => JSON.stringify({x, y, height});
  if (el && typeof el.selectionStart === "number" && typeof el.value === "string") {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = style.font;
    const before = el.value.slice(0, el.selectionStart);
    const size = parseFloat(style.fontSize) || 16;
    const x = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      + ctx.measureText(before).width - el.scrollLeft;
    return out(Math.min(x, rect.right), rect.top + (rect.height - size) / 2, size);
  }
  const selection = getSelection();
  if (selection && selection.rangeCount > 0 && el && el.isContentEditable) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return out(rect.left, rect.top, rect.height || 16);
  }
  return "";
})()`;
const CARET_REFRESH_MS = 60;

const MONO = "ui-monospace, Menlo, Consolas, monospace";
const ADDRESS_FONT = `20px ${MONO}`;
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
  private address: AddressEdit = addressEditOf("");
  private addressDragging = false;
  private addressScroll = 0;
  private taskId: string | null = null;
  private pageCaret: ScreenCaret | null = null;
  private composition: string | null = null;
  private caretTimer: number | undefined;
  private notice: readonly string[] | null = null;
  private tearUntil = 0;
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
    // 1 回だけ描いておく。canvas をまだ一度も描いていないうちに CanvasTexture が GPU へ上がると、
    // Chrome が「Browser fails extracting valid resource from external image」を出して転送を飛ばす
    // (テクスチャを作った時点で needsUpdate が立ち、最初の描画で上げられる)。
    this.compose();
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
      this.addressDragging = false;
    }
    if (this.addressDragging) {
      if (event.type === "up") {
        this.addressDragging = false;
      } else {
        this.setAddress(
          moveAddressCaret(this.address, this.addressIndexAt(event.x), true),
        );
      }
      return;
    }
    if (event.y < TOOLBAR_HEIGHT && !this.pagePressed) {
      if (event.type === "down") {
        this.pressToolbar(event);
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
    if (event.type === "down") {
      this.refreshPageCaret();
    }
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
    if (event.type === "down" && this.browserShortcut(event)) {
      return;
    }
    if (!this.addressFocused) {
      if (event.type === "down" && copyKey(event)) {
        void this.copyFromPage(event);
        return;
      }
      this.engine.key(event);
      this.refreshPageCaret();
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
    if (copyKey(event)) {
      writeClipboard(selectedAddressText(this.address));
    }
    this.setAddress(applyAddressKey(this.address, event));
  }

  insertText(text: string): void {
    if (!this.addressFocused) {
      this.engine.insertText(text);
      this.refreshPageCaret();
      return;
    }
    this.setAddress(applyAddressText(this.address, text));
  }

  setComposition(text: string | null): void {
    const next = text === "" ? null : text;
    if (next !== this.composition) {
      this.composition = next;
      this.markChrome();
    }
  }

  caretPoint(): ScreenCaret | null {
    if (!this.addressFocused) {
      return this.pageCaret;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const r = TOOLBAR_LAYOUT.address;
    ctx.font = ADDRESS_FONT;
    const at =
      this.composition === null
        ? this.address.caret
        : addressSelection(this.address).start;
    const before = Array.from(this.address.text).slice(0, at).join("");
    const x =
      r.x +
      ADDRESS_PADDING -
      this.addressScroll +
      ctx.measureText(before).width;
    return {x, y: r.y + r.height / 2 - 11, height: 22};
  }

  private refreshPageCaret(): void {
    window.clearTimeout(this.caretTimer);
    this.caretTimer = window.setTimeout(() => {
      void this.readPageCaret();
    }, CARET_REFRESH_MS);
  }

  private async readPageCaret(): Promise<void> {
    const json = await this.engine.evalContent(PAGE_CARET);
    this.pageCaret = json ? toScreenCaret(json) : null;
  }

  startTask(taskId: string): void {
    if (taskId === this.taskId) {
      return;
    }
    const first = this.taskId === null && this.history.length === 0;
    this.taskId = taskId;
    if (first) {
      return;
    }
    this.blurAddress();
    const home = this.engine.homeUrl();
    this.history = [home];
    this.historyIndex = 0;
    this.url = home;
    this.engine.goHome();
    this.awaitNavigation(home);
  }

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
    window.clearTimeout(this.caretTimer);
    this.engine.dispose();
    this.texture.dispose();
  }

  private markChrome(): void {
    this.chromeDirty = true;
  }

  private pressToolbar(event: ScreenPointerEvent): void {
    const part = hitToolbar(event.x, event.y);
    if (part === "back" && this.canGoBack) {
      this.blurAddress();
      this.moveInHistory(this.historyIndex - 1);
    } else if (part === "forward" && this.canGoForward) {
      this.blurAddress();
      this.moveInHistory(this.historyIndex + 1);
    } else if (part === "address") {
      this.pressAddress(event);
    }
  }

  private pressAddress(event: ScreenPointerEvent): void {
    if (!this.addressFocused) {
      this.focusAddress();
      return;
    }
    const at = this.addressIndexAt(event.x);
    if (event.clickCount >= 3) {
      this.setAddress(applyAddressKey(this.address, selectAllKey));
      return;
    }
    if (event.clickCount === 2) {
      this.setAddress(selectAddressWord(this.address, at));
      return;
    }
    this.setAddress(moveAddressCaret(this.address, at, event.modifiers.shift));
    this.addressDragging = true;
  }

  private browserShortcut(event: ScreenKeyEvent): boolean {
    const {ctrl, meta, alt, shift} = event.modifiers;
    if (!(ctrl || meta) || alt || shift) {
      return false;
    }
    const key = event.key.toLowerCase();
    if (key === "l") {
      this.focusAddress();
      return true;
    }
    if (this.addressFocused) {
      return false;
    }
    if (key === "[" && this.canGoBack) {
      this.moveInHistory(this.historyIndex - 1);
      return true;
    }
    if (key === "]" && this.canGoForward) {
      this.moveInHistory(this.historyIndex + 1);
      return true;
    }
    return false;
  }

  /**
   * ページでのコピー・切り取り。エンジンのクリップボードは外へ出てこないので、選んでいる文字を
   * 読んで本物のクリップボードへ書く。切り取りは、読んでからエンジンへキーを送って消してもらう
   */
  private async copyFromPage(event: ScreenKeyEvent): Promise<void> {
    const text = await this.engine.evalContent(PAGE_SELECTION);
    if (text) {
      writeClipboard(text);
    }
    this.engine.key(event);
  }

  private setAddress(next: AddressEdit): void {
    if (next !== this.address) {
      this.address = next;
      this.markChrome();
    }
  }

  private addressIndexAt(x: number): number {
    const ctx = this.canvas.getContext("2d");
    const chars = Array.from(this.address.text);
    if (!ctx) {
      return chars.length;
    }
    ctx.font = ADDRESS_FONT;
    const target =
      x - TOOLBAR_LAYOUT.address.x - ADDRESS_PADDING + this.addressScroll;
    let previous = 0;
    for (let i = 1; i <= chars.length; i += 1) {
      const width = ctx.measureText(chars.slice(0, i).join("")).width;
      if (width >= target) {
        return target - previous < width - target ? i - 1 : i;
      }
      previous = width;
    }
    return chars.length;
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
    this.engine.rememberPage(target);
    this.engine.navigate(target);
    this.awaitNavigation(target);
  }

  private awaitNavigation(target: string): void {
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
    this.address = addressEditOf(addressDraftFor(this.url), true);
    this.addressScroll = 0;
    this.markChrome();
  }

  private blurAddress(): void {
    if (!this.addressFocused) {
      return;
    }
    this.addressFocused = false;
    this.addressDragging = false;
    this.address = addressEditOf("");
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
    this.refreshPageCaret();
    const href = await this.engine.evalContent("location.href");
    if (!href) {
      return;
    }
    this.lastHref = href;
    this.engine.rememberPage(href);
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
    this.drawPageComposition(ctx);
    this.drawNotice(ctx);
  }

  private drawPageComposition(ctx: CanvasRenderingContext2D): void {
    const text = this.composition;
    const caret = this.pageCaret;
    if (text === null || this.addressFocused || !caret) {
      return;
    }
    const size = Math.max(12, caret.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOOLBAR_HEIGHT, SCREEN_CANVAS.width, CONTENT_HEIGHT);
    ctx.clip();
    ctx.font = `${size}px ${JA_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const width = ctx.measureText(text).width;
    ctx.fillStyle = COLORS.field;
    ctx.fillRect(caret.x - 3, caret.y - 2, width + 5, size + 4);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(text, caret.x, caret.y);
    ctx.fillRect(caret.x, caret.y + size + 1, width, 2);
    ctx.fillRect(caret.x + width, caret.y - 1, 2, size + 2);
    ctx.restore();
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

    const padding = ADDRESS_PADDING;
    const maxWidth = r.width - padding * 2;
    ctx.font = ADDRESS_FONT;
    ctx.textBaseline = "middle";
    const cy = r.y + r.height / 2;

    if (focused) {
      this.drawAddressEdit(ctx, maxWidth, cy);
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

  private drawAddressEdit(
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
    cy: number,
  ): void {
    const r = TOOLBAR_LAYOUT.address;
    const {start, end} = addressSelection(this.address);
    const typed = Array.from(this.address.text);
    const composing =
      this.composition === null ? [] : Array.from(this.composition);
    const chars =
      this.composition === null
        ? typed
        : [...typed.slice(0, start), ...composing, ...typed.slice(end)];
    const text = chars.join("");
    const caret =
      this.composition === null ? this.address.caret : start + composing.length;
    const widthTo = (index: number) =>
      ctx.measureText(chars.slice(0, index).join("")).width;
    const caretX = widthTo(caret);
    const total = widthTo(chars.length);
    if (total <= maxWidth) {
      this.addressScroll = 0;
    } else if (caretX - this.addressScroll > maxWidth) {
      this.addressScroll = caretX - maxWidth;
    } else if (caretX < this.addressScroll) {
      this.addressScroll = caretX;
    }
    const left = r.x + ADDRESS_PADDING - this.addressScroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x + ADDRESS_PADDING - 2, r.y, maxWidth + 4, r.height);
    ctx.clip();
    const selecting = this.composition === null && start !== end;
    if (selecting) {
      const from = widthTo(start);
      ctx.fillStyle = COLORS.select;
      ctx.fillRect(left + from, r.y + 6, widthTo(end) - from, r.height - 12);
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(text, left, cy);
    if (this.composition !== null) {
      const from = widthTo(start);
      ctx.fillRect(left + from, cy + 12, caretX - from, 2);
    }
    if (!selecting) {
      ctx.fillRect(left + caretX, cy - 11, 2, 22);
    }
    ctx.restore();
  }
}

const toScreenCaret = (json: string): ScreenCaret | null => {
  try {
    const {x, y, height} = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof height !== "number" ||
      y < 0 ||
      y > CONTENT_HEIGHT
    ) {
      return null;
    }
    return {x, y: y + TOOLBAR_HEIGHT, height};
  } catch {
    return null;
  }
};

const selectAllKey = {
  key: "a",
  charCode: 0,
  modifiers: {ctrl: true, meta: false},
};

const copyKey = (event: ScreenKeyEvent): boolean => {
  const {ctrl, meta, alt, shift} = event.modifiers;
  const key = event.key.toLowerCase();
  return (ctrl || meta) && !alt && !shift && (key === "c" || key === "x");
};

const writeClipboard = (text: string): void => {
  if (!text) {
    return;
  }
  navigator.clipboard?.writeText(text).catch(() => {});
};

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
