import {useSyncExternalStore} from "react";

export interface LookDelta {
  dx: number;
  dy: number;
}

let locked = false;
let dx = 0;
let dy = 0;
const listeners = new Set<() => void>();

const setLocked = (value: boolean): void => {
  if (locked === value) {
    return;
  }
  locked = value;
  if (!value) {
    dx = 0;
    dy = 0;
  }
  for (const l of listeners) {
    l();
  }
};

export const isPointerLocked = (): boolean => locked;

/** 蓄積したマウス移動量(px)を取り出してゼロに戻す。フレームごとに 1 回、アクティブな制御側だけが呼ぶ */
export const consumeLookDelta = (): LookDelta => {
  const out = {dx, dy};
  dx = 0;
  dy = 0;
  return out;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePointerLocked = (): boolean =>
  useSyncExternalStore(subscribe, isPointerLocked);

const warn = (e: unknown) =>
  console.warn("[pointerLock] ロックできませんでした", e);

/**
 * 生のマウス移動量(unadjustedMovement)を要求する。未対応(NotSupportedError)のときだけ引数なしで再試行する。
 * Esc 解除直後の再ロック制限(SecurityError 等)では再試行しない(制限明けに加速つきでロックされるのを防ぐ)
 */
const requestLock = (target: HTMLElement): void => {
  const result = target.requestPointerLock({unadjustedMovement: true}) as
    | Promise<void>
    | undefined;
  // Promise を返さない実装では unadjustedMovement は無視されているので何もしない
  if (typeof result?.catch !== "function") {
    return;
  }
  result.catch((e: unknown) => {
    if (!(e instanceof Error && e.name === "NotSupportedError")) {
      warn(e);
      return;
    }
    Promise.resolve(target.requestPointerLock()).catch(warn);
  });
};

let suppressions = 0;

/**
 * マウスで画面（PC など）を操作している間、キャンバスのクリックで pointer lock を取らせない。
 * 戻り値は解除関数（二重に呼んでも 1 回分しか解除しない）
 */
export const suppressPointerLock = (): (() => void) => {
  suppressions++;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    suppressions--;
  };
};

/** target のクリックで pointer lock を要求し、ロック中のマウス移動量を蓄積する。戻り値は解除関数 */
export const connectPointerLock = (target: HTMLElement): (() => void) => {
  const doc = target.ownerDocument;
  const onClick = () => {
    if (doc.pointerLockElement !== target && suppressions === 0) {
      requestLock(target);
    }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (doc.pointerLockElement !== target) {
      return;
    }
    dx += e.movementX;
    dy += e.movementY;
  };
  const onChange = () => setLocked(doc.pointerLockElement === target);

  target.addEventListener("click", onClick);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("pointerlockchange", onChange);
  onChange();

  return () => {
    target.removeEventListener("click", onClick);
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("pointerlockchange", onChange);
    setLocked(false);
  };
};
