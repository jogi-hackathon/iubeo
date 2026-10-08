import {describe, expect, it, vi} from "vitest";

import {
  CLOSE_REPLACED,
  CLOSE_SESSION_ENDED,
  CLOSE_SLOW,
  createSessionConnection,
  type SocketLike,
} from "../connection";
import type {ServerMessage, SessionSnapshot} from "../types";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Array<string | ArrayBuffer> = [];
  closedWith: number | null = null;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;

  constructor(readonly url: string) {}

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? null;
    this.readyState = 3;
  }

  // サーバー側の操作
  serverOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(message: ServerMessage | string | ArrayBuffer) {
    this.onmessage?.({
      data:
        typeof message === "string" || message instanceof ArrayBuffer
          ? message
          : JSON.stringify(message),
    });
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({code});
  }
}

const snapshot = (seq: number): ServerMessage => ({
  type: "snapshot",
  session: {seq} as SessionSnapshot,
});
const taskCompleted = (seq: number): ServerMessage => ({
  type: "task.completed",
  seq,
  taskId: `task-${seq}`,
  completedAt: "2026-10-01T12:00:00Z",
});

const setup = (options: {maxRetries?: number} = {}) => {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ms: number; fn: () => void; cancelled: boolean}> = [];
  const conn = createSessionConnection({
    sessionId: "sess-1",
    url: "ws://test/api/v1/sessions/sess-1/ws",
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    schedule: (fn, ms) => {
      const t = {ms, fn, cancelled: false};
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    ...options,
  });
  const latest = () => sockets[sockets.length - 1]!;
  /** 予約された再接続を実行する */
  const runTimers = () => {
    for (const t of timers.splice(0)) {
      if (!t.cancelled) {
        t.fn();
      }
    }
  };
  return {conn, sockets, timers, latest, runTimers};
};

describe("createSessionConnection", () => {
  it("開くと open になり、type ごとに配る", () => {
    const {conn, latest} = setup();
    expect(conn.getState().status).toBe("connecting");
    latest().serverOpen();
    expect(conn.getState().status).toBe("open");

    const onSnapshot = vi.fn();
    const onTask = vi.fn();
    conn.on("snapshot", onSnapshot);
    conn.on("task.completed", onTask);
    latest().serverSend(snapshot(10));
    latest().serverSend(taskCompleted(11));

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onTask).toHaveBeenCalledWith(taskCompleted(11));
  });

  it("snapshot の seq 以下のメッセージと、snapshot より前の seq を持つメッセージは捨てる", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const onTask = vi.fn();
    conn.on("task.completed", onTask);

    latest().serverSend(taskCompleted(5)); // snapshot 前
    latest().serverSend(snapshot(10));
    latest().serverSend(taskCompleted(10)); // 基準と同じ
    latest().serverSend(taskCompleted(9)); // 古い
    latest().serverSend(taskCompleted(11));
    latest().serverSend(taskCompleted(11)); // 重複

    expect(onTask.mock.calls.map(([m]) => m.seq)).toEqual([11]);
  });

  it("seq を持たないメッセージは seq を見ずに配る", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const onTransforms = vi.fn();
    const onError = vi.fn();
    conn.on("transforms", onTransforms);
    conn.on("error", onError);

    latest().serverSend({type: "error", code: "bad", message: "x"});
    latest().serverSend(snapshot(10));
    latest().serverSend({
      type: "transforms",
      serverTime: "2026-10-01T12:00:00Z",
      players: [],
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onTransforms).toHaveBeenCalledTimes(1);
  });

  it("壊れた JSON や未知の type は捨てる", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onSnapshot = vi.fn();
    conn.on("snapshot", onSnapshot);

    latest().serverSend("{not json");
    latest().serverSend(JSON.stringify({type: "unknown"}));
    latest().serverSend(JSON.stringify({type: "toString"}));

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("コールバックの例外は他のコールバックに影響しない", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    conn.on("snapshot", () => {
      throw new Error("boom");
    });
    conn.on("snapshot", after);

    latest().serverSend(snapshot(1));

    expect(after).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("解除したコールバックは呼ばない", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const cb = vi.fn();
    const off = conn.on("snapshot", cb);
    off();
    latest().serverSend(snapshot(1));
    expect(cb).not.toHaveBeenCalled();
  });

  it("開いている間だけ送る", () => {
    const {conn, latest} = setup();
    const msg = {
      type: "interact",
      objectId: "directory-1",
      heldItem: null,
    } as const;
    expect(conn.send(msg)).toBe(false);
    latest().serverOpen();
    expect(conn.send(msg)).toBe(true);
    expect(JSON.parse(latest().sent[0] as string)).toEqual(msg);
  });

  it("位置(transform)はバイナリで送る", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    conn.send({
      type: "transform",
      seq: 7,
      position: [1, 2, 3],
      yaw: 0.5,
      pitch: -0.25,
    });
    const sent = latest().sent[0];
    expect(sent).toBeInstanceOf(ArrayBuffer);
    const v = new DataView(sent as ArrayBuffer);
    expect([
      v.getUint8(0),
      v.getUint32(1, true),
      v.getFloat32(5, true),
      v.getFloat32(17, true),
    ]).toEqual([1, 7, 1, 0.5]);
  });

  it("バイナリの transforms を、snapshot の席から playerId に直して配る", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const onTransforms = vi.fn();
    conn.on("transforms", onTransforms);
    latest().serverSend({
      type: "snapshot",
      session: {
        seq: 1,
        players: [
          {playerId: "p1", seat: 1},
          {playerId: "p2", seat: 2},
        ],
      } as SessionSnapshot,
    });
    // 席 2 と、まだ知らない席 3
    const buf = new ArrayBuffer(10 + 2 * 25);
    const v = new DataView(buf);
    v.setUint8(0, 2);
    v.setFloat64(1, Date.UTC(2026, 9, 1), true);
    v.setUint8(9, 2);
    for (const [i, seat] of [2, 3].entries()) {
      const o = 10 + i * 25;
      v.setUint8(o, seat);
      v.setUint32(o + 1, 42, true);
      v.setFloat32(o + 5, 1.5, true);
      v.setFloat32(o + 17, 0.25, true);
    }
    latest().serverSend(buf);
    expect(onTransforms).toHaveBeenCalledTimes(1);
    const m = onTransforms.mock.calls[0]![0];
    expect(m.serverTime).toBe("2026-10-01T00:00:00.000Z");
    expect(m.players).toEqual([
      {
        playerId: "p2",
        transform: {seq: 42, position: [1.5, 0, 0], yaw: 0.25, pitch: 0},
      },
    ]);
  });

  it("形の合わないバイナリは捨てる", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onTransforms = vi.fn();
    conn.on("transforms", onTransforms);
    latest().serverSend(new ArrayBuffer(3));
    expect(onTransforms).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("切れたら待ち時間を延ばしながら再接続し、新しい接続の snapshot を基準にする", () => {
    const {conn, sockets, timers, latest, runTimers} = setup();
    latest().serverOpen();
    latest().serverSend(snapshot(10));
    const onTask = vi.fn();
    conn.on("task.completed", onTask);

    latest().serverClose(CLOSE_SLOW);
    expect(conn.getState()).toEqual({
      status: "reconnecting",
      closeCode: CLOSE_SLOW,
    });
    expect(timers.map((t) => t.ms)).toEqual([500]);
    runTimers();
    expect(sockets).toHaveLength(2);

    // つながる前に、もう一度失敗する
    latest().serverClose(1006);
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    runTimers();

    latest().serverOpen();
    expect(conn.getState().status).toBe("open");
    // 再接続後は snapshot が届くまで、seq を持つメッセージを捨てる
    latest().serverSend(taskCompleted(11));
    latest().serverSend(snapshot(20));
    latest().serverSend(taskCompleted(21));
    expect(onTask.mock.calls.map(([m]) => m.seq)).toEqual([21]);

    // snapshot が届いたので、待ち時間は最初に戻る
    latest().serverClose(1006);
    expect(timers.map((t) => t.ms)).toEqual([500]);
  });

  it("サーバーから 1000 で閉じられたら再接続する(受信の失敗でも 1000 で閉じるため)", () => {
    const {conn, timers, latest} = setup();
    latest().serverOpen();
    latest().serverClose(1000);
    expect(conn.getState().status).toBe("reconnecting");
    expect(timers).toHaveLength(1);
  });

  it.each([
    ["セッション終了", CLOSE_SESSION_ENDED],
    ["別の接続に置き換え", CLOSE_REPLACED],
  ])("%s(%i)で閉じられたら再接続しない", (_, code) => {
    const {conn, timers, latest} = setup();
    latest().serverOpen();
    latest().serverClose(code);
    expect(conn.getState()).toEqual({status: "closed", closeCode: code});
    expect(timers).toHaveLength(0);
  });

  it("再接続の上限を超えたら closed にする", () => {
    const {conn, sockets, latest, runTimers} = setup({maxRetries: 2});
    latest().serverClose(1006);
    runTimers();
    latest().serverClose(1006);
    runTimers();
    latest().serverClose(1006);
    expect(sockets).toHaveLength(3);
    expect(conn.getState()).toEqual({status: "closed", closeCode: 1006});
  });

  it("close() で閉じたら、予約した再接続も取り消す", () => {
    const {conn, sockets, latest, runTimers} = setup();
    latest().serverOpen();
    latest().serverClose(1006);
    conn.close();
    runTimers();
    expect(sockets).toHaveLength(1);
    expect(conn.getState().status).toBe("closed");
  });

  it("close() は接続を 1000 で閉じ、その後の通知は無視する", () => {
    const {conn, latest} = setup();
    latest().serverOpen();
    const socket = latest();
    const onSnapshot = vi.fn();
    conn.on("snapshot", onSnapshot);
    conn.close();
    expect(socket.closedWith).toBe(1000);
    socket.serverSend(snapshot(1));
    socket.serverClose(1000);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(conn.getState().status).toBe("closed");
  });

  it("状態が変わるたびに subscribe したリスナーを呼ぶ", () => {
    const {conn, latest} = setup();
    const listener = vi.fn();
    conn.subscribe(listener);
    latest().serverOpen();
    latest().serverClose(1006);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
