import type {Texture} from "three/webgpu";

import type {PageSnapshot} from "../../../judge/types";

export type CursorKind = "default" | "pointer" | "text";

export type ScreenModifiers = {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
};

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
  insertText(text: string): void;

  readonly liveSurface?: boolean;

  tick(): void;
  isDirty(): boolean;
  clearDirty(): void;
  escapeIsLocal?(): boolean;
  cursorKind(x: number, y: number): CursorKind;

  readPage?(): Promise<PageSnapshot | null>;
  onPageChange?: (url: string) => void;
  setNotice?(lines: readonly string[] | null, tear?: boolean): void;
  caretPoint?(): ScreenCaret | null;
  setComposition?(text: string | null): void;
  startTask?(taskId: string): void;

  dispose(): void;
}

export type ScreenCaret = {x: number; y: number; height: number};

export const NO_MODIFIERS: ScreenModifiers = {
  alt: false,
  ctrl: false,
  shift: false,
  meta: false,
};

export const SYNTHETIC_KEY = Symbol("screen.synthetic-key");
