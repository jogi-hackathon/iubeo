import {SCREEN_CANVAS} from "./browserChrome";
import {BrowserScreen} from "./BrowserScreen";
import {KeyboardCapture} from "./KeyboardCapture";
import type {ScreenSource} from "./types";

export const SCREEN_RESOLUTION = SCREEN_CANVAS;

let screen: BrowserScreen | null = null;
let keyboard: KeyboardCapture | null = null;

export const engineScreen = (): ScreenSource => {
  screen ??= new BrowserScreen();
  return screen;
};

export const engineKeyboard = (): KeyboardCapture => {
  keyboard ??= new KeyboardCapture();
  return keyboard;
};
