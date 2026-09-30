import type {SceneName} from "./index";

export type SceneState =
  | {status: "idle"; current: SceneName}
  | {status: "transitioning"; from: SceneName; to: SceneName};

export type SceneEvents = {
  transitionStart: {from: SceneName; to: SceneName};
  transitionEnd: {from: SceneName; to: SceneName};
};

export type SceneTransitionContext = {from: SceneName; to: SceneName};

export type SceneManagerOptions = {
  initial: SceneName;
  /** 使えるシーン。ここに無いシーンへの遷移・初期化はできない */
  available: readonly SceneName[];
  /** 遷移演出。resolve するまで transitioning のまま待つ */
  runTransition?: (ctx: SceneTransitionContext) => Promise<void>;
};

/** 将来ここを PC 画面へのズームイン演出などに差し替える差し込み口。既定は演出なし */
const noTransition = (): Promise<void> => Promise.resolve();

export const createSceneManager = ({
  initial,
  available,
  runTransition = noTransition,
}: SceneManagerOptions) => {
  if (!available.includes(initial)) {
    throw new Error(`使えないシーンです: ${initial}`);
  }

  // 遷移中も App は from のシーンを描画し続け、idle になった時点で to に切り替わる
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: SceneState = {status: "idle", current: initial};
  const listeners = new Set<() => void>();
  const handlers: {[K in keyof SceneEvents]: Set<(e: SceneEvents[K]) => void>} =
    {
      transitionStart: new Set(),
      transitionEnd: new Set(),
    };

  // コールバックの例外が他のコールバック・状態更新に影響しないようにする
  const set = (next: SceneState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const emit = <K extends keyof SceneEvents>(
    event: K,
    payload: SceneEvents[K],
  ) => {
    // 通知中に追加されたコールバックは、今回のイベントでは呼ばない
    for (const cb of Array.from(handlers[event])) {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    getState: (): SceneState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <K extends keyof SceneEvents>(
      event: K,
      callback: (e: SceneEvents[K]) => void,
    ) => {
      handlers[event].add(callback);
      return () => {
        handlers[event].delete(callback);
      };
    },
    /** 遷移中の呼び出し・現在と同じシーン・使えないシーンへの遷移は無視する */
    goTo: async (to: SceneName): Promise<void> => {
      if (state.status !== "idle" || state.current === to) {
        return;
      }
      if (!available.includes(to)) {
        return;
      }
      const from = state.current;

      set({status: "transitioning", from, to});
      emit("transitionStart", {from, to});
      try {
        await runTransition({from, to});
      } catch (e) {
        // 演出に失敗したら元のシーンへ戻す。transitionEnd は発火しない
        console.error(e);
        set({status: "idle", current: from});
        return;
      }
      // transitionEnd の時点で getState() は既に idle/to になっている。
      // ただしハンドラ内から goTo すると、後続のハンドラでは次の遷移の状態になる。
      // ハンドラは getState() ではなく引数 {from, to} を見ること
      set({status: "idle", current: to});
      emit("transitionEnd", {from, to});
    },
  };
};

export type SceneManager = ReturnType<typeof createSceneManager>;
