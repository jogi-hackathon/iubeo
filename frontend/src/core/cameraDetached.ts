import {useSyncExternalStore} from "react";

/**
 * カメラが、プレイヤーの目の位置から十分離れているか。俯瞰ビューへの移動中など、自分の身体(頭)が
 * 視界に入る間に true にする。毎フレーム書いてよく、値が変わったときだけ通知する(再レンダーは、しきい値をまたいだときだけ)
 */
let detached = false;
const listeners = new Set<() => void>();

export const isCameraDetached = (): boolean => detached;

export const setCameraDetached = (value: boolean): void => {
  if (detached === value) {
    return;
  }
  detached = value;
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const subscribeCameraDetached = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useCameraDetached = (): boolean =>
  useSyncExternalStore(subscribeCameraDetached, isCameraDetached);
