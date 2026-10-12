import {KeyboardCapture} from "../../display/KeyboardCapture";
import {SCREEN_CANVAS} from "../../display/resolution";
import type {ScreenSource} from "../../display/types";
import {BrowserScreen} from "./BrowserScreen";

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
