import {describe, expect, it, vi} from "vitest";

import {ApiError, CLOSE_REPLACED, CLOSE_SESSION_ENDED} from "../../net";
import type {MatchmakingStatus, Me} from "../../net";
import {createGameFlow, type FlowApi} from "../gameFlow";

const err = (status: number, code: string) =>
  new ApiError(status, {code, message: code});

const queued = (): MatchmakingStatus => ({
  status: "queued",
  queuedAt: "2026-10-01T00:00:00Z",
});
const matched = (sessionId = "s1"): MatchmakingStatus => ({
  status: "matched",
  queuedAt: "2026-10-01T00:00:00Z",
  sessionId,
});
const me = (sessionId: string | null = null): Me => ({
  playerId: "p1",
  sessionId,
});

// 呼び出しごとの結果を、順に返す(値なら resolve、ApiError / Error なら reject)。尽きたら最後の値を返し続ける
const seq =
  <T>(...results: Array<T | Error>) =>
  () => {
    const r = results.length > 1 ? results.shift()! : results[0]!;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };

const setup = (
  overrides: Partial<Record<keyof FlowApi, () => Promise<unknown>>> = {},
) => {
  const api = {
    createPlayer: vi.fn(overrides.createPlayer ?? seq(me())),
    getMe: vi.fn(overrides.getMe ?? seq(me())),
    joinMatchmaking: vi.fn(overrides.joinMatchmaking ?? seq(queued())),
    getMatchmaking: vi.fn(overrides.getMatchmaking ?? seq(queued())),
    leaveMatchmaking: vi.fn(
      overrides.leaveMatchmaking ?? (() => Promise.resolve(undefined)),
    ),
  };
  const navigator = {enter: vi.fn()};
  // sleep は呼ばれた順に溜め、wake で 1 つずつ起こす
  const sleepers: Array<() => void> = [];
  const sleep = vi.fn(
    () => new Promise<void>((resolve) => sleepers.push(resolve)),
  );
  const flow = createGameFlow({
    api: api as unknown as FlowApi,
    navigator,
    sleep,
    pollMs: 1000,
  });
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  const wake = async () => {
    sleepers.shift()?.();
    await flush();
  };
  return {api, navigator, sleep, flow, flush, wake, sleepers};
};

describe("gameFlow", () => {
  it("発行 → 待機 → ポーリング → 成立 → sandbox へ移動 → sessionReady で inSession", async () => {
    const t = setup({
      getMatchmaking: seq(queued(), matched("s1")),
    });
    expect(t.flow.getState()).toEqual({status: "idle"});
    const done = t.flow.startMatchmaking();
    expect(t.flow.getState()).toEqual({status: "issuing"});
    await t.flush();
    expect(t.api.createPlayer).toHaveBeenCalledTimes(1);
    expect(t.api.joinMatchmaking).toHaveBeenCalledTimes(1);
    expect(t.flow.getState()).toMatchObject({status: "queued", playerId: "p1"});
    expect(t.flow.currentSession()).toBeNull();

    await t.wake(); // 1 回目のポーリング: queued
    expect(t.flow.getState().status).toBe("queued");
    expect(t.navigator.enter).not.toHaveBeenCalled();
    await t.wake(); // 2 回目: matched
    await done;
    expect(t.api.getMatchmaking).toHaveBeenCalledTimes(2);
    expect(t.flow.getState()).toEqual({
      status: "entering",
      playerId: "p1",
      sessionId: "s1",
    });
    expect(t.navigator.enter).toHaveBeenCalledWith("sandbox");
    expect(t.flow.currentSession()).toEqual({sessionId: "s1", playerId: "p1"});

    t.flow.sessionReady();
    expect(t.flow.getState()).toEqual({
      status: "inSession",
      playerId: "p1",
      sessionId: "s1",
    });
    expect(t.flow.currentSession()).toEqual({sessionId: "s1", playerId: "p1"});
  });

  it("pollMs ごとに見る", async () => {
    const t = setup();
    void t.flow.startMatchmaking();
    await t.flush();
    expect(t.sleep).toHaveBeenCalledWith(1000);
  });

  it("join の応答が既に matched なら、ポーリングせずに成立", async () => {
    const t = setup({joinMatchmaking: seq(matched("s9"))});
    await t.flow.startMatchmaking();
    expect(t.api.getMatchmaking).not.toHaveBeenCalled();
    expect(t.flow.getState()).toMatchObject({
      status: "entering",
      sessionId: "s9",
    });
  });

  it("Me.sessionId があれば(再読み込み・戻り)、待機列を飛ばして成立", async () => {
    const t = setup({createPlayer: seq(me("s2"))});
    await t.flow.startMatchmaking();
    expect(t.api.joinMatchmaking).not.toHaveBeenCalled();
    expect(t.api.getMatchmaking).not.toHaveBeenCalled();
    expect(t.flow.getState()).toEqual({
      status: "entering",
      playerId: "p1",
      sessionId: "s2",
    });
    expect(t.navigator.enter).toHaveBeenCalledWith("sandbox");
  });

  it("join が 409(セッション参加中)なら、getMe で引いて成立", async () => {
    const t = setup({
      joinMatchmaking: seq(err(409, "in_session")),
      getMe: seq(me("s3")),
    });
    await t.flow.startMatchmaking();
    expect(t.api.getMe).toHaveBeenCalledTimes(1);
    expect(t.flow.getState()).toMatchObject({
      status: "entering",
      sessionId: "s3",
    });
  });

  it("join が 409 でも参加中のセッションが無ければ、エラー", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup({
      joinMatchmaking: seq(err(409, "in_session")),
      getMe: seq(me(null)),
    });
    await t.flow.startMatchmaking();
    expect(t.flow.getState().status).toBe("error");
  });

  it("ポーリングが 404(待機列から外れた)なら、入り直して続ける", async () => {
    const t = setup({
      getMatchmaking: seq<MatchmakingStatus>(
        err(404, "not_queued"),
        matched("s4"),
      ),
    });
    const done = t.flow.startMatchmaking();
    await t.flush();
    await t.wake(); // 404 → 入り直し(join 2 回目)→ queued
    expect(t.api.joinMatchmaking).toHaveBeenCalledTimes(2);
    expect(t.flow.getState().status).toBe("queued");
    await t.wake(); // matched
    await done;
    expect(t.flow.getState()).toMatchObject({
      status: "entering",
      sessionId: "s4",
    });
  });

  it("入り直しの join が 409 なら、参加中のセッションへ", async () => {
    const t = setup({
      joinMatchmaking: seq(queued(), err(409, "in_session")),
      getMatchmaking: seq(err(404, "not_queued")),
      getMe: seq(me("s5")),
    });
    const done = t.flow.startMatchmaking();
    await t.flush();
    await t.wake();
    await done;
    expect(t.flow.getState()).toMatchObject({
      status: "entering",
      sessionId: "s5",
    });
  });

  describe("cancelMatchmaking", () => {
    it("待機をやめて idle に戻り、ポーリングは止まる", async () => {
      const t = setup();
      const done = t.flow.startMatchmaking();
      await t.flush();
      expect(t.flow.getState().status).toBe("queued");
      await t.flow.cancelMatchmaking();
      expect(t.api.leaveMatchmaking).toHaveBeenCalledTimes(1);
      expect(t.flow.getState()).toEqual({status: "idle"});
      // 寝ていたポーリングが起きても、もう見ない
      await t.wake();
      await done;
      expect(t.api.getMatchmaking).not.toHaveBeenCalled();
      expect(t.sleepers).toHaveLength(0);
      expect(t.navigator.enter).not.toHaveBeenCalled();
    });

    it("取り消し中にポーリングの応答が成立を返しても、捨てる(DELETE の結果に従う)", async () => {
      let resolvePoll!: (s: MatchmakingStatus) => void;
      const t = setup({
        getMatchmaking: () =>
          new Promise<MatchmakingStatus>((r) => {
            resolvePoll = r;
          }),
      });
      void t.flow.startMatchmaking();
      await t.flush();
      await t.wake(); // ポーリング中(応答待ち)
      const cancel = t.flow.cancelMatchmaking();
      resolvePoll(matched("sX"));
      await cancel;
      expect(t.flow.getState()).toEqual({status: "idle"});
      expect(t.navigator.enter).not.toHaveBeenCalled();
    });

    it("やめる前に成立していた(409)なら、そのまま成立として進む", async () => {
      const t = setup({
        leaveMatchmaking: seq(err(409, "matched")),
        getMe: seq(me("s6")),
      });
      const done = t.flow.startMatchmaking();
      await t.flush();
      await t.flow.cancelMatchmaking();
      expect(t.flow.getState()).toEqual({
        status: "entering",
        playerId: "p1",
        sessionId: "s6",
      });
      expect(t.navigator.enter).toHaveBeenCalledTimes(1);
      expect(t.navigator.enter).toHaveBeenCalledWith("sandbox");
      // 寝ていたポーリングは、もう何もしない(二重に入らない)
      await t.wake();
      await done;
      expect(t.api.getMatchmaking).not.toHaveBeenCalled();
      expect(t.navigator.enter).toHaveBeenCalledTimes(1);
    });

    it("既に待機列に居ない(404)なら、idle に戻る", async () => {
      const t = setup({leaveMatchmaking: seq(err(404, "not_queued"))});
      void t.flow.startMatchmaking();
      await t.flush();
      await t.flow.cancelMatchmaking();
      expect(t.flow.getState()).toEqual({status: "idle"});
    });

    it("発行中に取り消すと、その続き(列に入る)は捨てる", async () => {
      let resolveIssue!: (m: Me) => void;
      const t = setup({
        createPlayer: () =>
          new Promise<Me>((r) => {
            resolveIssue = r;
          }),
      });
      const done = t.flow.startMatchmaking();
      await t.flow.cancelMatchmaking();
      expect(t.flow.getState()).toEqual({status: "idle"});
      resolveIssue(me());
      await done;
      expect(t.api.joinMatchmaking).not.toHaveBeenCalled();
      expect(t.flow.getState()).toEqual({status: "idle"});
    });

    it("列に入る要求の途中で取り消すと、要求が返ってから待機列を抜ける", async () => {
      let resolveJoin!: (m: MatchmakingStatus) => void;
      const t = setup({
        joinMatchmaking: () =>
          new Promise<MatchmakingStatus>((r) => {
            resolveJoin = r;
          }),
      });
      const done = t.flow.startMatchmaking();
      await t.flush();
      expect(t.flow.getState()).toEqual({status: "issuing"});
      await t.flow.cancelMatchmaking();
      expect(t.api.leaveMatchmaking).not.toHaveBeenCalled();

      resolveJoin(queued());
      await done;
      expect(t.api.leaveMatchmaking).toHaveBeenCalledTimes(1);
      expect(t.flow.getState()).toEqual({status: "idle"});
    });

    it("取り消した後に start し直していたら、前の要求が返っても、新しい待機は抜けない", async () => {
      const joins: Array<(m: MatchmakingStatus) => void> = [];
      const t = setup({
        joinMatchmaking: () =>
          new Promise<MatchmakingStatus>((r) => {
            joins.push(r);
          }),
      });
      const first = t.flow.startMatchmaking();
      await t.flush();
      await t.flow.cancelMatchmaking();
      const second = t.flow.startMatchmaking();
      await t.flush();

      joins[0]!(queued());
      await first;
      expect(t.api.leaveMatchmaking).not.toHaveBeenCalled();
      joins[1]!(matched("s2"));
      await second;
      expect(t.flow.currentSession()).toEqual({
        playerId: "p1",
        sessionId: "s2",
      });
    });

    it("待機中でなければ何もしない", async () => {
      const t = setup();
      await t.flow.cancelMatchmaking();
      expect(t.api.leaveMatchmaking).not.toHaveBeenCalled();
    });
  });

  describe("API のエラー", () => {
    it("プレイヤーの発行に失敗したら error。もう一度 start できる", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const t = setup({
        createPlayer: seq(new Error("boom"), me("s7")),
      });
      await t.flow.startMatchmaking();
      expect(t.flow.getState()).toEqual({status: "error", message: "boom"});
      await t.flow.startMatchmaking();
      expect(t.flow.getState()).toMatchObject({
        status: "entering",
        sessionId: "s7",
      });
    });

    it("入るのに失敗(409 以外)したら error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const t = setup({joinMatchmaking: seq(err(500, "internal"))});
      await t.flow.startMatchmaking();
      expect(t.flow.getState()).toEqual({status: "error", message: "internal"});
    });

    it("ポーリングが 404 以外で失敗したら error(止まる)", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const t = setup({getMatchmaking: seq(err(500, "internal"))});
      const done = t.flow.startMatchmaking();
      await t.flush();
      await t.wake();
      await done;
      expect(t.flow.getState().status).toBe("error");
      expect(t.sleepers).toHaveLength(0);
    });

    it("移動(navigator)が失敗したら error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const t = setup({createPlayer: seq(me("s8"))});
      t.navigator.enter.mockRejectedValueOnce(new Error("no scene"));
      await t.flow.startMatchmaking();
      await t.flush();
      expect(t.flow.getState()).toEqual({status: "error", message: "no scene"});
    });

    it("待機中・セッション中の start は無視する", async () => {
      const t = setup();
      void t.flow.startMatchmaking();
      await t.flush();
      await t.flow.startMatchmaking();
      expect(t.api.createPlayer).toHaveBeenCalledTimes(1);
    });
  });

  describe("セッションの終わり", () => {
    const inSession = async () => {
      const t = setup({createPlayer: seq(me("s1"))});
      await t.flow.startMatchmaking();
      t.flow.sessionReady();
      t.navigator.enter.mockClear();
      return t;
    };

    it("4001(別のタブに置き換えられた)は notice を付けて idle。自動では入り直さない", async () => {
      const t = await inSession();
      t.flow.sessionClosed(CLOSE_REPLACED);
      expect(t.flow.getState()).toEqual({status: "idle", notice: "replaced"});
      expect(t.flow.currentSession()).toBeNull();
      expect(t.navigator.enter).toHaveBeenCalledWith("room");
      await t.flush();
      expect(t.api.createPlayer).toHaveBeenCalledTimes(1);
      expect(t.api.joinMatchmaking).not.toHaveBeenCalled();
    });

    it("4000(セッション終了)や再接続を諦めた close は、idle で room へ戻る(notice なし)", async () => {
      for (const code of [CLOSE_SESSION_ENDED, 1006]) {
        const t = await inSession();
        t.flow.sessionClosed(code);
        expect(t.flow.getState()).toEqual({status: "idle"});
        expect(t.navigator.enter).toHaveBeenCalledWith("room");
      }
    });

    it("notice は次の start で消える", async () => {
      const t = await inSession();
      t.flow.sessionClosed(CLOSE_REPLACED);
      void t.flow.startMatchmaking();
      expect(t.flow.getState()).toEqual({status: "issuing"});
    });

    it("入る途中(entering)で閉じても、room へ戻る", async () => {
      const t = setup({createPlayer: seq(me("s1"))});
      await t.flow.startMatchmaking();
      t.navigator.enter.mockClear();
      t.flow.sessionClosed(1006);
      expect(t.flow.getState()).toEqual({status: "idle"});
      expect(t.navigator.enter).toHaveBeenCalledWith("room");
    });

    it("セッションに居ないときの close は無視する(移動もしない)", () => {
      const t = setup();
      t.flow.sessionClosed(CLOSE_SESSION_ENDED);
      expect(t.flow.getState()).toEqual({status: "idle"});
      expect(t.navigator.enter).not.toHaveBeenCalled();
    });

    it("leftSession は idle に戻す(移動はしない。次の start でセッションに戻れる)", async () => {
      const t = await inSession();
      t.flow.leftSession();
      expect(t.flow.getState()).toEqual({status: "idle"});
      expect(t.navigator.enter).not.toHaveBeenCalled();
      // サーバーのセッションは残っているので、Me.sessionId で戻れる
      await t.flow.startMatchmaking();
      expect(t.flow.getState()).toMatchObject({
        status: "entering",
        sessionId: "s1",
      });
    });

    it("sessionReady は entering のときだけ効く", () => {
      const t = setup();
      t.flow.sessionReady();
      expect(t.flow.getState()).toEqual({status: "idle"});
    });
  });

  it("状態が変わるたびに購読者へ通知する", async () => {
    const t = setup({createPlayer: seq(me("s1"))});
    const listener = vi.fn();
    const off = t.flow.subscribe(listener);
    await t.flow.startMatchmaking();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    off();
    t.flow.sessionReady();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
