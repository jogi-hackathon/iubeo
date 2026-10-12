import {getConsoleFunction, setConsoleFunction} from "three/webgpu";

/**
 * R3F 9 はストアを作るときに `new THREE.Clock()` を呼び、three r183 で非推奨になった Clock の警告が毎回出る。
 * R3F の内部なので直せず、Clock を差し替えると R3F の時間の進み方が変わるので、この 1 文だけ落とす。
 * three はスタック付きの警告を `isStackTrace` / `getError` の形で渡すので、それを Error にして出す。
 */
const KNOWN_NOISE: readonly string[] = [
  "Clock: This module has been deprecated. Please use THREE.Timer instead.",
];

type ConsoleType = "log" | "warn" | "error";

type ThreeStackTrace = {
  isStackTrace: true;
  getError: (message: string) => Error;
};

const isStackTrace = (v: unknown): v is ThreeStackTrace =>
  typeof v === "object" &&
  v !== null &&
  (v as {isStackTrace?: unknown}).isStackTrace === true &&
  typeof (v as {getError?: unknown}).getError === "function";

export const threeConsoleHandler = (
  type: ConsoleType,
  message: string,
  ...params: unknown[]
): void => {
  if (type === "warn" && KNOWN_NOISE.some((noise) => message.includes(noise))) {
    return;
  }
  const [first] = params;
  if (isStackTrace(first)) {
    console[type](first.getError(message));
    return;
  }
  console[type](message, ...params);
};

export const filterThreeLog = (): void => {
  if (getConsoleFunction()) {
    return;
  }
  setConsoleFunction(threeConsoleHandler);
};
