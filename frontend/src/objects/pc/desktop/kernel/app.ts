import type {Size} from "./geometry";

/** アプリの窓の中身が受け取るマウスの入力。座標は窓の中身の左上からのピクセル */
export type AppPointerEvent = {
  type: "move" | "down" | "up";
  x: number;
  y: number;
  button: number;
};

/** 開いている窓の中身。シェルが窓ごとに 1 つ作り、閉じたら dispose する */
export interface AppView {
  paint(ctx: CanvasRenderingContext2D, size: Size): void;
  pointer?(event: AppPointerEvent): void;
  /** 中身が変わって描き直しが要るときに呼ぶ */
  subscribe?(listener: () => void): () => void;
  /** 押しかけ・つかみかけを、何も起こさずにやめる(PC から離れたとき) */
  cancel?(): void;
  dispose?(): void;
}

/** アプリがシェルへ頼めること */
export type AppContext = {
  /** 自分の窓を閉じる */
  close(): void;
};

export type IconName = "terminal" | "settings";

/** デスクトップに置くアプリ。同じアプリの窓は 1 つだけ開く */
export type DesktopApp = {
  id: string;
  title: string;
  icon: IconName;
  /** 窓の中身の大きさ(枠とタイトルバーを除く) */
  size: Size;
  open(context: AppContext): AppView;
};
