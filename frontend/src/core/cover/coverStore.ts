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

// 初期状態は覆ったまま(起動の最初から白い覆いを出す)。
// 開発中に HMR でこのモジュールが読み直されると、初期状態(覆ったまま)に戻る。そのときはページを再読み込みする
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
  /**
   * 覆う・外す。覆うときは前の進捗バーを消す。外すときはバーを残す(白と一緒にフェードアウトさせ、消すのは cover.ts の uncoverScreen)
   */
  setCovered: (covered: boolean): void => {
    if (covered === state.covered) {
      return;
    }
    set({...state, covered, bar: covered ? null : state.bar});
  },
  /** 起動の覆いを終える(以後、シーンの遷移を始められる) */
  finishBoot: (): void => {
    if (state.booting) {
      set({...state, booting: false});
    }
  },
  /** 進捗バーを出す(段階が変わったときだけ since を取り直す) */
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
