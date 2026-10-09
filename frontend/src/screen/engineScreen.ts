import {SCREEN_CANVAS} from "./browserChrome";
import {BrowserScreen} from "./BrowserScreen";
import {KeyboardCapture} from "./KeyboardCapture";
import type {ScreenSource} from "./types";

/**
 * PC の画面（Gecko）と、それへ鍵盤を渡す受け口は、アプリに 1 つずつだけ持つ。
 * エンジンの起動は数十 MB の wasm を読むため数十秒かかる。React の再マウントや HMR で
 * 作り直すと、そのたびに起動し直しになるので、React のライフサイクルには結び付けない。
 *
 * 解像度は 4:3（ブラウン管と同じ比）。
 */
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
