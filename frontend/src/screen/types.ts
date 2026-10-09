import type {Texture} from "three/webgpu";

/**
 * PC の画面に映る中身の共通の型。画面は、自分の画素がどこから来るのかを知らない。
 * 今は Gecko(wasm のエンジン)だけだが、同じインターフェースを実装すれば差し替えられる。
 *
 * ソースは canvas を 1 枚持ち、それを Texture として公開し、入力を *canvas 画素* 座標で受け取る。
 */

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
