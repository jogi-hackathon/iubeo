import {useSyncExternalStore} from "react";

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

export const toggles = createToggleStore();

export const useToggleState = (): ToggleState =>
  useSyncExternalStore(toggles.subscribe, toggles.getState);

/** key が表示中か。値(boolean)で購読するので、他のキーの切り替えでは再描画しない */
export const useIsVisible = (key: string): boolean =>
  useSyncExternalStore(toggles.subscribe, () => toggles.isVisible(key));

/** key の機能が ON か(非表示なら OFF) */
export const useIsEnabled = (key: string): boolean =>
  useSyncExternalStore(toggles.subscribe, () => toggles.isEnabled(key));
