import type {Size} from "./geometry";

export type AppPointerEvent = {
  type: "move" | "down" | "up";
  x: number;
  y: number;
  button: number;
};

export interface AppView {
  paint(ctx: CanvasRenderingContext2D, size: Size): void;
  pointer?(event: AppPointerEvent): void;
  subscribe?(listener: () => void): () => void;
  reveal?(options: LaunchOptions): void;
  /** 押しかけ・つかみかけを、何も起こさずにやめる(PC から離れたとき) */
  cancel?(): void;
  dispose?(): void;
}

export type LaunchOptions = {tab?: string};

/** アプリがシェルへ頼めること */
export type AppContext = {
  launch(appId: string, options?: LaunchOptions): void;
  /** 自分の窓を閉じる */
  close(): void;
};

export type IconName = "terminal" | "settings";

export type DesktopApp = {
  id: string;
  title: string;
  icon: IconName;
  size: Size;
  open(context: AppContext, options?: LaunchOptions): AppView;
};
