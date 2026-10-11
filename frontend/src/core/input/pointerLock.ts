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

let target: HTMLElement | null = null;

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

export const resumePointerLock = (): void => {
  const el = target;
  if (el === null || suppressions > 0) {
    return;
  }
  if (el.ownerDocument.pointerLockElement === el) {
    return;
  }
  requestLock(el);
};

export const connectPointerLock = (element: HTMLElement): (() => void) => {
  const doc = element.ownerDocument;
  const onClick = () => {
    if (doc.pointerLockElement !== element && suppressions === 0) {
      requestLock(element);
    }
  };
  const onMouseMove = (e: MouseEvent) => {
    if (doc.pointerLockElement !== element) {
      return;
    }
    dx += e.movementX;
    dy += e.movementY;
  };
  const onChange = () => setLocked(doc.pointerLockElement === element);

  target = element;
  element.addEventListener("click", onClick);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("pointerlockchange", onChange);
  onChange();

  return () => {
    element.removeEventListener("click", onClick);
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("pointerlockchange", onChange);
    if (target === element) {
      target = null;
    }
    setLocked(false);
  };
};
