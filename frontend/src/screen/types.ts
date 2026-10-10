import type {Texture} from "three/webgpu";

import type {PageSnapshot} from "../judge/types";

export type CursorKind = "default" | "pointer" | "text";

export type ScreenModifiers = {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
};

/** ポインタ座標は常に canvas 画素。原点は左上 */
export type ScreenPointerEvent = {
  type: "move" | "down" | "up";
  x: number;
  y: number;
  button: number;
  buttons: number;
  clickCount: number;
  modifiers: ScreenModifiers;
};

export type ScreenKeyEvent = {
  type: "down" | "up";
  key: string;
  keyCode: number;
  /** 印刷可能なキーでのみ非ゼロ。エンジンではこれが文字を挿入する */
  charCode: number;
  modifiers: ScreenModifiers;
};

export type ScreenStatus =
  | "idle"
  | "booting"
  | "ready"
  | "error"
  | "unavailable";

export interface ScreenSource {
  /** 画面のマテリアルがサンプリングする */
  readonly texture: Texture;
  readonly width: number;
  readonly height: number;
  readonly status: ScreenStatus;
  readonly statusDetail: string;

  boot(): Promise<void>;

  pointer(event: ScreenPointerEvent): void;
  wheel(
    dx: number,
    dy: number,
    x: number,
    y: number,
    modifiers: ScreenModifiers,
  ): void;
  key(event: ScreenKeyEvent): void;
  /** IME の確定や貼り付け用。キーイベントを介さずに文字列を入れる */
  insertText(text: string): void;

  /**
   * 毎フレーム読み直すべき生きたサーフェスか。wasm エンジンの GPU モードは、こちらから
   * 再アップロードの機会を知れないので true になる。既定（false）は dirty のときだけ読む
   */
  readonly liveSurface?: boolean;

  /** ソースが持つアニメーションを進める（エンジンのフレーム供給など） */
  tick(): void;
  /** 次の描画の前にテクスチャを再アップロードすべきか */
  isDirty(): boolean;
  /** テクスチャをアップロードした直後に呼ぶ */
  clearDirty(): void;
  /** Escape を画面の中で使うか（アドレス欄の編集を取り消すなど）。true の間は、Escape で PC から離れない */
  escapeIsLocal?(): boolean;
  /** この canvas 位置で OS カーソルをどう見せるか */
  cursorKind(x: number, y: number): CursorKind;

  /** 今表示しているページの情報（Web Search の判定に渡す）。取れなければ null */
  readPage?(): Promise<PageSnapshot | null>;
  /**
   * 表示中のページが変わったときに呼ぶ。Web Search の判定は、プレイヤーの操作ではなく
   * これをきっかけに走る（彼らは常に見ている）
   */
  onPageChange?: (url: string) => void;
  /**
   * 画面の一部として出す一時的な通知（HUD ではない）。null で消す。
   * 判定の結果など、外に出したくない知らせをブラウン管の中に出すために使う。
   * tear を立てると、出した直後に走査が乱れる（「彼ら」の介入）
   */
  setNotice?(lines: readonly string[] | null, tear?: boolean): void;

  dispose(): void;
}

export const NO_MODIFIERS: ScreenModifiers = {
  alt: false,
  ctrl: false,
  shift: false,
  meta: false,
};

/**
 * ソース自身が合成したキーイベントに付ける目印。エンジンへ入力するため canvas に投げたキーは
 * （bubbles: true なので）window のキャプチャ段階を通り、そのまま KeyboardCapture が本物のキーと
 * 勘違いすると、送る → 受ける → 送る…と無限に再帰する。この目印で合成イベントを識別して除外する
 */
export const SYNTHETIC_KEY = Symbol("screen.synthetic-key");
