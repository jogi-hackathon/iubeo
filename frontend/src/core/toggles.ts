import {createContext, useContext, useSyncExternalStore} from "react";

export type ToggleState = {
  /** 非表示のキー。ここに無いキーは表示(初期状態は全部表示) */
  hidden: ReadonlySet<string>;
  /** 機能 OFF のキー。ここに無いキーは機能 ON(初期状態は全部 ON) */
  disabled: ReadonlySet<string>;
};

/**
 * キーごとの「表示・非表示」と「機能の ON・OFF」。クライアント内部だけの状態で、サーバーのオブジェクトの状態(users・data など)は変えない。
 * チュートリアルが、進行に応じて各オブジェクトの出し入れ・使えるかどうかを切り替えるために使う
 * (オブジェクト本来の挙動はそのままで、チュートリアルは「使い方を教える」だけ)。
 * キーは、オブジェクトなら kind(ManagedObjects が見る)、プロップなら名前(各シーンが見る)。
 *
 * - 非表示: 見た目を消し、当たり判定・インタラクトも無効にする(機能も OFF として扱う)
 * - 機能 OFF: 見た目と当たり判定は残し、狙い・インタラクトだけ無効にする
 *
 * 非表示でも mesh はマウントしたままにする(外すとベイク AO の mesh 構成が変わって、AO が無効になるため)
 *
 * ストアはシーンが所有する(シーンのマウントで作り、TogglesProvider で配下に配る)。シーンを出ればストアごと捨てられるので、リセット処理は要らない
 */
export const createToggleStore = () => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: ToggleState = {hidden: new Set(), disabled: new Set()};
  const listeners = new Set<() => void>();

  const notify = () => {
    // コールバックの例外が他のコールバック・状態更新に影響しないようにする
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  /** key を set に入れる(on)か外す(!on)。今と同じなら null(変更なし) */
  const toggled = (
    set: ReadonlySet<string>,
    key: string,
    on: boolean,
  ): ReadonlySet<string> | null => {
    if (set.has(key) === on) {
      return null;
    }
    const next = new Set(set);
    if (on) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return next;
  };

  return {
    getState: (): ToggleState => state,
    isVisible: (key: string): boolean => !state.hidden.has(key),
    /** 機能が ON か(非表示のものは OFF) */
    isEnabled: (key: string): boolean =>
      !state.hidden.has(key) && !state.disabled.has(key),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 表示・非表示を切り替える。今と同じ値なら何もしない(通知もしない) */
    setVisible: (key: string, visible: boolean): void => {
      const hidden = toggled(state.hidden, key, !visible);
      if (hidden) {
        state = {...state, hidden};
        notify();
      }
    },
    /** 機能の ON・OFF を切り替える(表示とは別の値。非表示の間は、ON にしても機能しない)。今と同じ値なら何もしない */
    setEnabled: (key: string, enabled: boolean): void => {
      const disabled = toggled(state.disabled, key, !enabled);
      if (disabled) {
        state = {...state, disabled};
        notify();
      }
    },
  };
};

export type ToggleStore = ReturnType<typeof createToggleStore>;

/** 配下のシーンのストア。Provider が無い場所(トグルを持たないシーン)は null で、全部表示・全部機能 ON として振る舞う */
export const TogglesContext = createContext<ToggleStore | null>(null);

/** 配下のシーンのトグルのストア。トグルを持たないシーンでは null */
export const useToggles = (): ToggleStore | null => useContext(TogglesContext);

// ストアが無いときの値。表示・機能 ON のまま変わらない
const ALL_ON: ToggleState = {hidden: new Set(), disabled: new Set()};
const noSubscribe = () => () => {};

/** store のトグルの状態を購読する。store が null なら、全部表示・全部機能 ON で変わらない */
export const useToggleStoreState = (store: ToggleStore | null): ToggleState =>
  useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    store ? store.getState : () => ALL_ON,
  );

export const useToggleState = (): ToggleState =>
  useToggleStoreState(useToggles());

/** key が表示中か。値(boolean)で購読するので、他のキーの切り替えでは再描画しない */
export const useIsVisible = (key: string): boolean => {
  const store = useToggles();
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, () =>
    store ? store.isVisible(key) : true,
  );
};

/** key の機能が ON か(非表示なら OFF) */
export const useIsEnabled = (key: string): boolean => {
  const store = useToggles();
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, () =>
    store ? store.isEnabled(key) : true,
  );
};

// 今マウントされているシーンのトグル。Canvas の外(DOM のデバッグパネル、将来のチュートリアル進行)が、
// Context を通さずに参照するための登録簿。シーンがマウントで登録し、アンマウントで解除する(TogglesProvider)
const active: ToggleStore[] = [];
const activeListeners = new Set<() => void>();

const notifyActive = () => {
  // コールバックの例外が他のコールバックに影響しないようにする
  for (const l of Array.from(activeListeners)) {
    try {
      l();
    } catch (e) {
      console.error(e);
    }
  }
};

/** store を、今のシーンのトグルとして登録する。解除関数を返す(複数あれば、最後に登録された物が今のシーン) */
export const registerActiveToggles = (store: ToggleStore): (() => void) => {
  active.push(store);
  notifyActive();
  return () => {
    const i = active.lastIndexOf(store);
    if (i >= 0) {
      active.splice(i, 1);
      notifyActive();
    }
  };
};

/** 今マウントされているシーンのトグル。トグルを持つシーンが無ければ null */
export const getActiveToggles = (): ToggleStore | null =>
  active[active.length - 1] ?? null;

export const subscribeActiveToggles = (listener: () => void) => {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
};

/** 今マウントされているシーンのトグル(getActiveToggles)を購読する。Canvas の外から使う */
export const useActiveToggles = (): ToggleStore | null =>
  useSyncExternalStore(subscribeActiveToggles, getActiveToggles);
