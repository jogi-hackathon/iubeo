import {ApiError, type ApiClient, CLOSE_REPLACED} from "../net";

// ゲームの流れ(シーンの外で進む手順): プレイヤー ID の発行 → マッチング → sandbox への移動 → セッション中 → 終了で room へ。
// シーンもオーソリティも知らない純粋な状態機械。外の世界(HTTP・シーン移動・待ち)は引数で受け取る。
// 呼ぶのは今は開発用パネルのボタンだけ(startMatchmaking 1 つの呼び出し。将来、チュートリアルの終わりから同じ関数を呼ぶ)

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

/** idle に戻った理由。replaced は、同じプレイヤーが別のタブで入り直して、こちらが切られた(4001) */
export type FlowNotice = "replaced";

export type GameFlowState =
  | {status: "idle"; notice?: FlowNotice}
  /** プレイヤー ID を発行している(POST /api/v1/players) */
  | {status: "issuing"}
  /** マッチングの待機中。queuedAt はサーバーの待機開始時刻 */
  | {status: "queued"; playerId: string; queuedAt?: string}
  /** マッチングが成立した(すぐ entering に進む) */
  | {status: "matched"; playerId: string; sessionId: string}
  /** sandbox への移動中。シーンのオーソリティが最初の snapshot を受け取るまで */
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
 * - sessionClosed(code): セッションの接続が終わった。room へ戻る。4001(別のタブに置き換えられた)は notice を付ける。
 *   自動で入り直さない(入り直すと、置き換えたタブを今度はこちらが切ってしまう)
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
  // 進行中の start / cancel を識別する。進めるたびに増やし、古い非同期の続きを捨てる
  let run = 0;
  // cancel の DELETE の応答待ち(二重に呼ばない)
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

  /** 成立: sandbox へ移る。移れるときまで待つのは navigator の仕事 */
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

  /** 参加中のセッションを引く(無ければ null) */
  const sessionOfMe = async (): Promise<{
    playerId: string;
    sessionId: string | null;
  }> => {
    const me = await api.getMe();
    return {playerId: me.playerId, sessionId: me.sessionId ?? null};
  };

  /**
   * 待機列に入る。成立済みなら sessionId を返す。セッション参加中(409)ならその sessionId。
   * どちらでもなければ(待機中)null
   */
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

  /**
   * 列に入る要求(join)が返る前に取り消されていたら、サーバーには入ってしまっているので、抜ける。
   * ただし、その間に start し直していたら、そちらの待機を消さないよう、流れが動いていないときだけ抜ける
   */
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
            // 見ない間に待機列から外された(10 秒)。入り直す
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
      // まだ列に入っていない。進行中の start の続きを捨てる
      run += 1;
      set({status: "idle"});
      return;
    }
    if (state.status !== "queued") {
      return;
    }
    // ポーリングを止める(以後に返る応答は捨てる)
    run += 1;
    cancelling = true;
    try {
      await api.leaveMatchmaking();
      set({status: "idle"});
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // やめる前に成立していた。そのまま進む
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
        // 既に待機列に居ない(10 秒見ない間に外れた)
        set({status: "idle"});
      } else {
        // 応答が分からなくても、ポーリングを止めたので列からは外れる(10 秒)。流れは idle に戻す
        console.error("[gameFlow]", e);
        set({status: "idle"});
      }
    } finally {
      cancelling = false;
    }
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
    /** sandbox のオーソリティが最初の snapshot を受け取った(entering のときだけ) */
    sessionReady: (): void => {
      if (state.status === "entering") {
        set({...state, status: "inSession"});
      }
    },
    /** 今入っている(入ろうとしている)セッション。シーンが、マウントのときに自分のオーソリティを決める用 */
    currentSession: (): {sessionId: string; playerId: string} | null =>
      state.status === "matched" ||
      state.status === "entering" ||
      state.status === "inSession"
        ? {sessionId: state.sessionId, playerId: state.playerId}
        : null,
    /** セッションの接続が終わった(再接続を諦めた・4000 セッション終了・4001 置き換え)。room へ戻る */
    sessionClosed: (code: number): void => {
      if (
        state.status !== "matched" &&
        state.status !== "entering" &&
        state.status !== "inSession"
      ) {
        return;
      }
      set(
        code === CLOSE_REPLACED
          ? {status: "idle", notice: "replaced"}
          : {status: "idle"},
      );
      goRoom();
    },
    /** sandbox を手動で離れた(流れは idle に戻る。サーバーのセッションは残るので、次の start で戻れる) */
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
