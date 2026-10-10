import {isEditableTarget} from "../core/input/useKeys";
import {type ScreenKeyEvent, type ScreenSource, SYNTHETIC_KEY} from "./types";

/**
 * 本物のキーボードを借り受け、画面ソースへ流し込む。PC を使っている間だけ engage し、
 * 離れると disengage する（それ以外のときは、プレイヤーの移動などがキーを使えるように素通しする）。
 *
 * 設計上の判断:
 *
 *  - リスナーは `window` の**キャプチャ段階**に置き、消費するキーは `stopPropagation()` する。
 *    エンジンが mousedown で `canvas.focus()` を呼ぶため、要素に付けたリスナーだと
 *    「画面の中をクリックした瞬間にキーを失う」から。window のバブリング段階にある
 *    プレイヤーの移動（core/input/useKeys）にも届かなくなる。
 *  - 隠し <textarea> をフォーカスしておく。IME の composition には本物の編集可能な要素が要る。
 *    `compositionend` で確定した文字列ごと `insertText()` に渡す（「候補から『日本語』が確定した」は
 *    キーイベントの列では表せない）。エンジンが canvas へフォーカスを移したら、textarea へ戻す。
 *  - keyup は、自分が keydown を受けたキーのものだけ消費する。PC を使い始める前から押していたキー
 *    （移動の W など）の keyup は素通しし、プレイヤーの移動側が「押しっぱなし」にならないようにする。
 *    離れるときに押されたままのキーは、画面へ keyup を送っておく。
 *  - Escape は画面から離れる合図として、`onActiveChange(false)` で呼び出し側に返す。
 *  - 編集可能な要素（デバッグパネルの入力欄など）宛のイベントは素通しする。
 */
export class KeyboardCapture {
  private readonly field: HTMLTextAreaElement;
  private source: ScreenSource | null = null;
  private active = false;
  private composing = false;
  private readonly pressed = new Map<string, ScreenKeyEvent>();
  private readonly teardown: Array<() => void> = [];

  onActiveChange?: (active: boolean) => void;

  constructor() {
    const field = document.createElement("textarea");
    field.setAttribute("aria-hidden", "true");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocomplete", "off");
    field.setAttribute("autocorrect", "off");
    field.spellcheck = false;
    field.tabIndex = -1;
    field.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:1px",
      "height:1px",
      "opacity:0",
      "border:0",
      "padding:0",
      "margin:0",
      "resize:none",
      "pointer-events:none",
      "z-index:-1",
    ].join(";");
    document.body.appendChild(field);
    this.field = field;
    this.listen();
  }

  get isActive(): boolean {
    return this.active;
  }

  engage(source: ScreenSource): void {
    this.source = source;
    if (this.active) {
      return;
    }
    this.active = true;
    this.field.focus({preventScroll: true});
    this.onActiveChange?.(true);
  }

  disengage(): void {
    for (const down of this.pressed.values()) {
      this.source?.key({...down, type: "up"});
    }
    this.pressed.clear();
    this.source = null;
    if (!this.active) {
      return;
    }
    this.active = false;
    this.composing = false;
    this.field.blur();
    this.field.value = "";
    this.onActiveChange?.(false);
  }

  dispose(): void {
    for (const off of this.teardown) {
      off();
    }
    this.teardown.length = 0;
    this.field.remove();
  }

  private listen(): void {
    const on = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      window.addEventListener(type, handler as EventListener, options);
      this.teardown.push(() =>
        window.removeEventListener(type, handler as EventListener),
      );
    };

    on("keydown", (event) => this.handleKeyDown(event), {capture: true});
    on("keyup", (event) => this.handleKeyUp(event), {capture: true});
    on("compositionstart", () => {
      this.composing = true;
    });
    on("compositionend", (event) => {
      this.composing = false;
      if (!this.active || !this.source) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const text = event.data ?? "";
      this.field.value = "";
      if (text) {
        this.source.insertText(text);
      }
    });
    on(
      "focusin",
      (event) => {
        if (
          this.active &&
          event.target !== this.field &&
          !isEditableTarget(event.target)
        ) {
          this.field.focus({preventScroll: true});
        }
      },
      {capture: true},
    );
    on("input", (event) => {
      if (event.target === this.field) {
        this.field.value = "";
      }
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.active || !this.source) {
      return;
    }
    if ((event as unknown as {[SYNTHETIC_KEY]?: boolean})[SYNTHETIC_KEY]) {
      return;
    }
    if (this.isOtherEditable(event.target)) {
      return;
    }
    if (isBrowserShortcut(event)) {
      return;
    }
    if (this.composing || event.isComposing) {
      return;
    }

    if (event.key === "Escape" && !this.source.escapeIsLocal?.()) {
      event.preventDefault();
      event.stopPropagation();
      this.disengage();
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "v"
    ) {
      event.preventDefault();
      event.stopPropagation();
      void this.pasteFromClipboard();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const down = toScreenKey(event, "down");
    this.pressed.set(event.code, down);
    this.source.key(down);
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        this.source?.insertText(text);
      }
    } catch {}
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.active || !this.source) {
      return;
    }
    if ((event as unknown as {[SYNTHETIC_KEY]?: boolean})[SYNTHETIC_KEY]) {
      return;
    }
    if (this.isOtherEditable(event.target)) {
      return;
    }
    if (isBrowserShortcut(event) || this.composing) {
      return;
    }
    if (!this.pressed.delete(event.code)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.source.key(toScreenKey(event, "up"));
  }

  private isOtherEditable(target: EventTarget | null): boolean {
    return target !== this.field && isEditableTarget(target);
  }
}

const toScreenKey = (
  event: KeyboardEvent,
  type: "down" | "up",
): ScreenKeyEvent => ({
  type,
  key: event.key,
  keyCode: event.keyCode,
  charCode: charCodeOf(event),
  modifiers: {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  },
});

const charCodeOf = (event: KeyboardEvent): number => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return 0;
  }
  if (event.key.length === 1) {
    return event.key.codePointAt(0) ?? 0;
  }
  if (event.key === "Enter") {
    return 13;
  }
  if (event.key === "Tab") {
    return 9;
  }
  return 0;
};

const isBrowserShortcut = (event: KeyboardEvent): boolean => {
  const key = event.key;
  const withCommand = event.ctrlKey || event.metaKey;
  if (key === "F5" || key === "F11" || key === "F12") {
    return true;
  }
  if (
    withCommand &&
    event.shiftKey &&
    ["I", "J", "C"].includes(key.toUpperCase())
  ) {
    return true;
  }
  return withCommand && ["r", "l", "t", "n", "w"].includes(key.toLowerCase());
};
