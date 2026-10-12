import {useSyncExternalStore} from "react";

export type PcLogoOptions = {
  schedule?: (fn: () => void, ms: number) => () => void;
};

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * PC の画面に IUBEO のロゴを、決めた時間だけ出す(チュートリアルを終えたときの起動画面)。
 * 出している間は、PC を使っていても画面へ入力を送らない(PcObject)
 */
export const createPcLogo = ({
  schedule = defaultSchedule,
}: PcLogoOptions = {}) => {
  let visible = false;
  let cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: boolean) => {
    if (visible === next) {
      return;
    }
    visible = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const hide = () => {
    cancel?.();
    cancel = null;
    set(false);
  };

  return {
    isVisible: () => visible,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show: (ms: number) => {
      cancel?.();
      set(true);
      cancel = schedule(hide, ms);
    },
    hide,
  };
};

export const pcLogo = createPcLogo();

export const usePcLogo = (): boolean =>
  useSyncExternalStore(pcLogo.subscribe, pcLogo.isVisible);
