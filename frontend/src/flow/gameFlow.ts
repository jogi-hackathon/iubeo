import {
  ApiError,
  type ApiClient,
  CLOSE_REPLACED,
  CLOSE_SESSION_ENDED,
} from "../net";

/** 流れが行き来するシーン(sceneStore の navigator が、実際のシーン名に写す) */
export type FlowScene = "room" | "sandbox";

/** 使う分だけの HTTP API(テストで偽物に差し替える) */
export type FlowApi = Pick<
  ApiClient,
  | "createPlayer"
  | "getMe"
  | "joinMatchmaking"
  | "getMatchmaking"
  | "leaveMatchmaking"
>;

export type FlowNavigator = {
  /** シーンへ移る(移れるときまで待つのは navigator の仕事)。流れは結果を待たない */
  enter: (scene: FlowScene) => void | Promise<void>;
};

/**
 * idle に戻った理由。console に出し、HUD が数秒だけ 1 行で出す(object-architecture §4)
 * - replaced: 同じプレイヤーが別のタブで入り直して、こちらが切られた(4001)
 * - dissolved: 開始までに人間がそろわず、セッションが解散した
 * - abandoned: 人間が全員切断したまま戻らず、セッションが破棄された
 * - lost: 再接続を諦めた(回線が切れた、サーバーが落ちたなど)
 */
export type FlowNotice = "replaced" | "dissolved" | "abandoned" | "lost";

/**
 * close の理由(コードと reason)から、HUD に出す通知を決める。
 * 正常な決着(finished)は結果を別に出すので、ここでは通知しない
 */
const noticeOf = (code: number, reason: string): FlowNotice | undefined => {
  if (code === CLOSE_REPLACED) {
    return "replaced";
  }
  if (code === CLOSE_SESSION_ENDED) {
    if (reason === "dissolved") {
      return "dissolved";
    }
    if (reason === "abandoned") {
      return "abandoned";
    }
    if (reason === "finished") {
      return undefined;
    }
  }
  return "lost";
};

export type GameFlowState =
  | {status: "idle"; notice?: FlowNotice}
  | {status: "issuing"}
  | {status: "queued"; playerId: string; queuedAt?: string}
  | {status: "matched"; playerId: string; sessionId: string}
  | {status: "entering"; playerId: string; sessionId: string}
  | {status: "inSession"; playerId: string; sessionId: string}
  | {status: "error"; message: string};

export type GameFlowOptions = {
  api: FlowApi;
  navigator: FlowNavigator;
  /** ms 待つ(テストで時間を進める用) */
  sleep: (ms: number) => Promise<void>;
  /** マッチングの状況を見る間隔。サーバーは 10 秒見ないと待機列から外すので、それより十分短くする */
  pollMs?: number;
};

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * ゲームの流れ。状態は idle → issuing → queued → matched → entering → inSession(エラーは error。再度 start で idle から)。
 *
 * - startMatchmaking: プレイヤーを作り(Cookie)、既にセッションに居れば(再読み込み・戻り)待機列を飛ばして matched。
 *   無ければ列に入って pollMs ごとに見る。見たら 404(10 秒見ないと外される)なら入り直す。入るとき 409(セッション参加中)なら、
 *   自分の参加中のセッションを引いて matched。matched になったら sandbox へ移る(entering)
 * - cancelMatchmaking: 待機をやめる(ポーリングは止まる)。既に成立していた(409)ならそのまま matched として進む
 * - sessionReady: sandbox のオーソリティが準備できた(entering → inSession)
 * - sessionFinished: 決着の通知(session.finished)を受けた。room へ戻る(結果は gameStore が持つ)
 * - sessionClosed(code, reason): セッションの接続が終わった。console に理由を出し、room へ戻る。
 *   close の理由から通知(FlowNotice)を決め、HUD が数秒だけ出す。4001(別のタブに置き換えられた)は
 *   notice を付ける。自動で入り直さない(入り直すと、置き換えたタブを今度はこちらが切ってしまう)
 * - leftSession: sandbox を手動で離れた(流れは idle に戻る。サーバーのセッションはそのまま。次の start で戻れる)
 */
export const createGameFlow = ({
  api,
  navigator,
  sleep,
  pollMs = 1000,
}: GameFlowOptions) => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: GameFlowState = {status: "idle"};
  const listeners = new Set<() => void>();
  let run = 0;
  let cancelling = false;

  const set = (next: GameFlowState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const fail = (e: unknown) => {
    console.error("[gameFlow]", e);
    set({status: "error", message: errorMessage(e)});
  };

  const enterSession = (playerId: string, sessionId: string) => {
    set({status: "matched", playerId, sessionId});
    set({status: "entering", playerId, sessionId});
    try {
      void Promise.resolve(navigator.enter("sandbox")).catch(fail);
    } catch (e) {
      fail(e);
    }
  };

  const goRoom = () => {
    try {
      void Promise.resolve(navigator.enter("room")).catch((e: unknown) =>
        console.error("[gameFlow]", e),
      );
    } catch (e) {
      console.error("[gameFlow]", e);
    }
  };

  const sessionOfMe = async (): Promise<{
    playerId: string;
    sessionId: string | null;
  }> => {
    const me = await api.getMe();
    return {playerId: me.playerId, sessionId: me.sessionId ?? null};
  };

  const join = async (): Promise<{
    sessionId: string | null;
    queuedAt?: string;
  }> => {
    try {
      const st = await api.joinMatchmaking();
      return {
        sessionId: st.status === "matched" ? (st.sessionId ?? null) : null,
        queuedAt: st.queuedAt,
      };
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const me = await sessionOfMe();
        if (!me.sessionId) {
          throw e;
        }
        return {sessionId: me.sessionId};
      }
      throw e;
    }
  };

  const leaveIfAbandoned = () => {
    if (state.status === "idle" || state.status === "error") {
      void api.leaveMatchmaking().catch(() => {});
    }
  };

  const startMatchmaking = async (): Promise<void> => {
    if (state.status !== "idle" && state.status !== "error") {
      return;
    }
    const mine = ++run;
    const alive = () => run === mine;
    set({status: "issuing"});
    try {
      const me = await api.createPlayer();
      if (!alive()) {
        return;
      }
      const playerId = me.playerId;
      if (me.sessionId) {
        enterSession(playerId, me.sessionId);
        return;
      }
      let joined = await join();
      if (!alive()) {
        leaveIfAbandoned();
        return;
      }
      while (!joined.sessionId) {
        set({status: "queued", playerId, queuedAt: joined.queuedAt});
        await sleep(pollMs);
        if (!alive()) {
          return;
        }
        try {
          const st = await api.getMatchmaking();
          if (!alive()) {
            return;
          }
          joined = {
            sessionId: st.status === "matched" ? (st.sessionId ?? null) : null,
            queuedAt: st.queuedAt,
          };
        } catch (e) {
          if (!alive()) {
            return;
          }
          if (e instanceof ApiError && e.status === 404) {
            joined = await join();
            if (!alive()) {
              leaveIfAbandoned();
              return;
            }
            continue;
          }
          throw e;
        }
      }
      enterSession(playerId, joined.sessionId);
    } catch (e) {
      if (alive()) {
        fail(e);
      }
    }
  };

  const cancelMatchmaking = async (): Promise<void> => {
    if (cancelling) {
      return;
    }
    if (state.status === "issuing") {
      run += 1;
      set({status: "idle"});
      return;
    }
    if (state.status !== "queued") {
      return;
    }
    run += 1;
    cancelling = true;
    try {
      await api.leaveMatchmaking();
      set({status: "idle"});
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const me = await sessionOfMe();
          if (me.sessionId) {
            enterSession(me.playerId, me.sessionId);
          } else {
            set({status: "idle"});
          }
        } catch (e2) {
          fail(e2);
        }
      } else if (e instanceof ApiError && e.status === 404) {
        set({status: "idle"});
      } else {
        console.error("[gameFlow]", e);
        set({status: "idle"});
      }
    } finally {
      cancelling = false;
    }
  };

  const inSessionState = (): boolean =>
    state.status === "matched" ||
    state.status === "entering" ||
    state.status === "inSession";

  /** room へ戻る(シーンの移動は待たない)。通知は console と HUD の両方に出す */
  const closeToRoom = (code: number, reason: string): void => {
    const notice = noticeOf(code, reason);
    console.warn(
      `[gameFlow] セッションとの接続が終わった (code=${code}, reason=${reason || "なし"})`,
      notice ?? "決着",
    );
    set(notice === undefined ? {status: "idle"} : {status: "idle", notice});
    goRoom();
  };

  return {
    getState: (): GameFlowState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startMatchmaking,
    cancelMatchmaking,
    sessionReady: (): void => {
      if (state.status === "entering") {
        set({...state, status: "inSession"});
      }
    },
    currentSession: (): {sessionId: string; playerId: string} | null =>
      state.status === "matched" ||
      state.status === "entering" ||
      state.status === "inSession"
        ? {sessionId: state.sessionId, playerId: state.playerId}
        : null,
    /** 決着(session.finished)を受けた。結果は gameStore が持つので、流れは room へ戻すだけ */
    sessionFinished: (): void => {
      if (!inSessionState()) {
        return;
      }
      set({status: "idle"});
      goRoom();
    },
    sessionClosed: (code: number, reason = ""): void => {
      if (!inSessionState()) {
        return;
      }
      closeToRoom(code, reason);
    },
    leftSession: (): void => {
      if (
        state.status === "matched" ||
        state.status === "entering" ||
        state.status === "inSession"
      ) {
        set({status: "idle"});
      }
    },
  };
};

export type GameFlow = ReturnType<typeof createGameFlow>;
