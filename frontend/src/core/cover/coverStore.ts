import {useSyncExternalStore} from "react";

/** 進捗バー。done は完了した段階の数(今は done 番目の段階の途中)。since は段階に入った時刻(performance.now) */
export interface CoverBar {
  total: number;
  done: number;
  since: number;
}

export interface CoverState {
  /** 白い覆いを被せているか(外すときはフェードアウトする) */
  covered: boolean;
  /** 進捗バー。null なら出さない */
  bar: CoverBar | null;
  /** 起動の覆いの間(起動のステップ・ウォームアップ・最初のシーンの準備)。この間はシーンの遷移を始めない */
  booting: boolean;
}

let state: CoverState = {covered: true, bar: null, booting: true};
const listeners = new Set<() => void>();

const set = (next: CoverState) => {
  state = next;
  for (const l of Array.from(listeners)) {
    l();
  }
};

/** 白い覆いと進捗バーの状態。起動・シェーダーのウォームアップ・シーン遷移のすべてがここを動かす */
export const coverStore = {
  getState: (): CoverState => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  setCovered: (covered: boolean): void => {
    if (covered === state.covered) {
      return;
    }
    set({...state, covered, bar: covered ? null : state.bar});
  },
  finishBoot: (): void => {
    if (state.booting) {
      set({...state, booting: false});
    }
  },
  setBar: (total: number, done: number): void => {
    const bar = state.bar;
    if (bar && bar.total === total && bar.done === done) {
      return;
    }
    set({...state, bar: {total, done, since: performance.now()}});
  },
  hideBar: (): void => {
    if (state.bar !== null) {
      set({...state, bar: null});
    }
  },
};

export const useCoverState = (): CoverState =>
  useSyncExternalStore(coverStore.subscribe, coverStore.getState);
