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
  cancel?(): void;
  dispose?(): void;
}

export type AppContext = {
  close(): void;
};

export type IconName = "terminal" | "settings";

export type DesktopApp = {
  id: string;
  title: string;
  icon: IconName;
  size: Size;
  open(context: AppContext): AppView;
};
