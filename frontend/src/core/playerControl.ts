import {useSyncExternalStore} from "react";

/**
 * プレイヤーの操作(移動・視点入力)とカメラを、別の演出が預かっている間の目印。
 * 俯瞰ビューやワークスペースでの作業など、プレイヤーを止めてカメラを別の制御に任せる場面が使う。
 * 複数の演出が重なっても、全部が解除されるまで預かり中になる
 */
let holders = 0;
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

/** 預かりを始める。戻り値の解除関数は、二重に呼んでも 1 回分しか解除しない */
export const lockPlayerControl = (): (() => void) => {
  holders++;
  if (holders === 1) {
    notify();
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holders--;
    if (holders === 0) {
      notify();
    }
  };
};

/** true の間、PlayerController は身体を止め、FirstPersonCamera はカメラに触れない */
export const isPlayerControlLocked = (): boolean => holders > 0;

export const subscribePlayerControl = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** 預かり中かを購読する(預かりの始まり・終わりのときだけ再レンダー) */
export const usePlayerControlLocked = (): boolean =>
  useSyncExternalStore(subscribePlayerControl, isPlayerControlLocked);
