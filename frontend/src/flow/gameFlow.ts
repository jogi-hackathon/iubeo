import {sfxEngine} from "../core/audio/sfx/engine";
import {
  ApiError,
  type ApiClient,
  CLOSE_REPLACED,
  CLOSE_SESSION_ENDED,
} from "../net";

export type FlowScene = "room" | "sandbox";

export type FlowApi = Pick<
  ApiClient,
  | "createPlayer"
  | "getMe"
  | "joinMatchmaking"
  | "getMatchmaking"
  | "leaveMatchmaking"
>;

export type FlowNavigator = {
  enter: (scene: FlowScene) => void | Promise<void>;
};

export type FlowNotice = "replaced" | "dissolved" | "abandoned" | "lost";

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
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
};

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export const createGameFlow = ({
  api,
  navigator,
  sleep,
  pollMs = 1000,
}: GameFlowOptions) => {
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
    sfxEngine.them("match");
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
