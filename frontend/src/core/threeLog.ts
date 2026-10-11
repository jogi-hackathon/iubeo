import {getConsoleFunction, setConsoleFunction} from "three/webgpu";

/**
 * three が console へ出す警告のうち、こちらでは直せないと分かっている物だけを落とす。
 *
 * 落とす物:
 * - `Clock: This module has been deprecated. Please use THREE.Timer instead.`
 *   `@react-three/fiber` 9 はストアを作るときに `new THREE.Clock()` を呼ぶ(時計を外から渡す口が無い)。
 *   three r183 で Clock が非推奨になったので毎回この警告が出るが、呼んでいるのは R3F の内部で、こちらからは直せない
 *   (Clock を自前の物に差し替えると R3F の時間の進み方が変わるほうが危ない)。落とすのはこの 1 文だけにして、
 *   他の警告・エラーはそのまま出す。
 *
 * 出力の形は three の既定(src/utils.js の warn / error / log)と同じにする
 * (スタック付きの警告は Error にして出す)。
 */
const KNOWN_NOISE: readonly string[] = [
  "Clock: This module has been deprecated. Please use THREE.Timer instead.",
];

type ConsoleType = "log" | "warn" | "error";

/** three の StackTrace(three 側の型に getError が無いので、形で見る) */
type ThreeStackTrace = {
  isStackTrace: true;
  getError: (message: string) => Error;
};

const isStackTrace = (v: unknown): v is ThreeStackTrace =>
  typeof v === "object" &&
  v !== null &&
  (v as {isStackTrace?: unknown}).isStackTrace === true &&
  typeof (v as {getError?: unknown}).getError === "function";

/** three の警告を通す・落とすを決める。テストから直接呼べるようにしてある */
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

/**
 * three のログの出口を差し替える。アプリの起動時に 1 回だけ呼ぶ(main.tsx)。
 * 既に誰かが独自の出口を入れている場合は触らない
 */
export const filterThreeLog = (): void => {
  if (getConsoleFunction()) {
    return;
  }
  setConsoleFunction(threeConsoleHandler);
};
