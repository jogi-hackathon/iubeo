import type {SceneName} from "./index";
import type {SceneManager} from "./sceneManager";

export type TransitionState =
  | {status: "idle"}
  | {status: "transitioning"; from: SceneName; to: SceneName};

export type TransitionEvents = {
  transitionStart: {from: SceneName; to: SceneName};
  transitionEnd: {from: SceneName; to: SceneName};
};

export type SceneTransitionContext = {from: SceneName; to: SceneName};

/** 遷移の段階ごとのフック。onLeave -> (演出) -> onPrepare + commit -> onEnter の順に呼ばれる */
export type TransitionHook = (ctx: SceneTransitionContext) => void;

export type SceneTransitionManagerOptions = {
  sceneManager: SceneManager;
  /** 遷移演出(覆う)。resolve するまで transitioning のまま待つ */
  runTransition?: (ctx: SceneTransitionContext) => Promise<void>;
  /** commit のあと、to の準備ができるまで待つ。resolve するまで finishTransition を呼ばない */
  waitReady?: (scene: SceneName) => Promise<void>;
  /** 準備ができたあとに演出を終える(覆いを外す)。transitionEnd の前に呼ぶ */
  finishTransition?: (ctx: SceneTransitionContext) => void;
  /** 今、遷移を始めてよいか(起動の覆いの間など、始めてはいけないときは false)。false なら goTo は何もしない */
  canStart?: () => boolean;
};

/** 既定は演出なし・準備は即完了 */
const noTransition = (): Promise<void> => Promise.resolve();
const noWait = (): Promise<void> => Promise.resolve();
const noFinish = (): void => {};
const always = (): boolean => true;

type Phase = "leave" | "prepare" | "enter";

/**
 * シーン切り替えの流れ(遷移の状態・演出・フック・イベント)。切り替えの結果は SceneManager に commit する。
 *
 * goTo の順序: transitionStart -> onLeave(from) -> runTransition -> onPrepare(to) と commit(to) -> onEnter(to)
 *   -> waitReady(to) -> finishTransition -> transitionEnd。
 * onPrepare と commit は同じ同期区間で続けて呼ぶ(React の再描画が 1 回にまとまり、新しいシーンに前のシーンのオブジェクトが
 * 一瞬出たり、ベイク AO の不一致が起きたりしない)。onPrepare は「新しいシーンが描かれる前」に、サーバー役のオブジェクトなどを揃える場所。
 * waitReady は commit の後で待つ(新しいシーンのマウントは commit の後に起きるため)。準備が終わるまで演出は終わらない
 */
export const createSceneTransitionManager = ({
  sceneManager,
  runTransition = noTransition,
  waitReady = noWait,
  finishTransition = noFinish,
  canStart = always,
}: SceneTransitionManagerOptions) => {
  // 遷移中も App は from のシーンを描画し続け(SceneManager が commit するまで current は from のまま)、idle になる前に to へ切り替わる
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: TransitionState = {status: "idle"};
  const listeners = new Set<() => void>();
  const handlers: {
    [K in keyof TransitionEvents]: Set<(e: TransitionEvents[K]) => void>;
  } = {
    transitionStart: new Set(),
    transitionEnd: new Set(),
  };
  const hooks: Record<Phase, Set<TransitionHook>> = {
    leave: new Set(),
    prepare: new Set(),
    enter: new Set(),
  };

  // コールバックの例外が他のコールバック・状態更新に影響しないようにする
  const set = (next: TransitionState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const emit = <K extends keyof TransitionEvents>(
    event: K,
    payload: TransitionEvents[K],
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

  const runHooks = (phase: Phase, ctx: SceneTransitionContext) => {
    for (const hook of Array.from(hooks[phase])) {
      try {
        hook(ctx);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const addHook = (phase: Phase, hook: TransitionHook) => {
    hooks[phase].add(hook);
    return () => {
      hooks[phase].delete(hook);
    };
  };

  return {
    getState: (): TransitionState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <K extends keyof TransitionEvents>(
      event: K,
      callback: (e: TransitionEvents[K]) => void,
    ) => {
      handlers[event].add(callback);
      return () => {
        handlers[event].delete(callback);
      };
    },
    /** 今のシーンを出る直前(演出の前)。俯瞰の解除など、今のシーンの後始末をする。解除関数を返す */
    onLeave: (hook: TransitionHook) => addHook("leave", hook),
    /** 新しいシーンへ commit する直前(同じ同期区間)。描かれる前に揃えておくものを置く。解除関数を返す */
    onPrepare: (hook: TransitionHook) => addHook("prepare", hook),
    /** 新しいシーンへ commit した直後。スポーン地点への移動など。解除関数を返す */
    onEnter: (hook: TransitionHook) => addHook("enter", hook),
    /** 遷移中の呼び出し・現在と同じシーン・使えないシーンへの遷移は無視する */
    goTo: async (to: SceneName): Promise<void> => {
      const from = sceneManager.getState().current;
      if (state.status !== "idle" || from === to || !canStart()) {
        return;
      }
      if (!sceneManager.isAvailable(to)) {
        return;
      }
      const ctx = {from, to};

      set({status: "transitioning", from, to});
      emit("transitionStart", ctx);
      runHooks("leave", ctx);
      try {
        await runTransition(ctx);
      } catch (e) {
        // 演出に失敗したら元のシーンのまま戻す。commit も transitionEnd もしない
        console.error(e);
        set({status: "idle"});
        return;
      }
      // commit まで await しない(同じ同期区間で、新しいシーンの用意と commit を続ける)
      runHooks("prepare", ctx);
      sceneManager.commit(to);
      runHooks("enter", ctx);
      // 準備が終わるまで演出を終えない。待ちが失敗しても commit 済みなので、演出は終えて遷移は完了させる
      try {
        await waitReady(to);
      } catch (e) {
        console.error(e);
      }
      try {
        finishTransition(ctx);
      } catch (e) {
        console.error(e);
      }
      // transitionEnd の時点で getState() は既に idle になっている。
      // ただしハンドラ内から goTo すると、後続のハンドラでは次の遷移の状態になる。
      // ハンドラは getState() ではなく引数 {from, to} を見ること
      set({status: "idle"});
      emit("transitionEnd", ctx);
    },
  };
};

export type SceneTransitionManager = ReturnType<
  typeof createSceneTransitionManager
>;
