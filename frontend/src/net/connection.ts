import type {
  ClientMessage,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
} from "./types";

/**
 * 接続の状態。プレイヤーの接続状態(スキーマの ConnectionStatus)とは別物なので、名前を分ける。
 * closed になったら再接続しない(作り直す)
 */
export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export type SocketState = {
  status: SocketStatus;
  /** 最後に閉じたときの close code。まだ閉じていなければ null */
  closeCode: number | null;
};

/** 使う分だけの WebSocket。テストで偽物に差し替える */
export type SocketLike = {
  readonly readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: {data: unknown}) => void) | null;
  onclose: ((ev: {code: number}) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

const OPEN = 1;

// サーバーの close code(backend/internal/session/conn.go)
export const CLOSE_NORMAL = 1000;
export const CLOSE_SESSION_ENDED = 4000;
export const CLOSE_REPLACED = 4001;
export const CLOSE_SLOW = 4002;

const NO_RETRY_CODES: ReadonlySet<number> = new Set([
  CLOSE_SESSION_ENDED,
  CLOSE_REPLACED,
]);

const SERVER_MESSAGE_TYPES = {
  snapshot: true,
  transforms: true,
  "session.started": true,
  "session.finished": true,
  "phase.started": true,
  "phase.ended": true,
  "task.completed": true,
  "object.upsert": true,
  "object.remove": true,
  "object.interactRejected": true,
  "player.updated": true,
  "team.updated": true,
  effect: true,
  error: true,
} satisfies Record<ServerMessageType, true>;

const isServerMessage = (v: unknown): v is ServerMessage =>
  typeof v === "object" &&
  v !== null &&
  Object.hasOwn(SERVER_MESSAGE_TYPES, (v as {type?: unknown}).type as string);

const seqOf = (message: ServerMessage): number | null => {
  if (message.type === "snapshot") {
    return message.session.seq;
  }
  return "seq" in message && typeof message.seq === "number"
    ? message.seq
    : null;
};

export type SessionConnectionOptions = {
  sessionId: string;
  /** 接続先。既定は同じオリジンの /api/v1/sessions/{sessionId}/ws */
  url?: string;
  /** テストで偽物に差し替える用。既定は new WebSocket(url) */
  createSocket?: (url: string) => SocketLike;
  /** ms 後に fn を呼び、取り消す関数を返す。テストで時間を進める用。既定は setTimeout */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** 再接続を試す回数の上限。超えたら closed にする */
  maxRetries?: number;
  /** 再接続の待ち時間。n 回目(1 始まり)は min(baseDelayMs * 2^(n-1), maxDelayMs) */
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const defaultUrl = (sessionId: string): string => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/v1/sessions/${encodeURIComponent(sessionId)}/ws`;
};

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * セッションの WebSocket 接続。受け取ったメッセージを type ごとに配り、要求(ClientMessage)を送る。
 * 状態の正はサーバーで、ここは届いた物を順序の検査だけして渡す(反映は受け取る側が行う)
 *
 * - 順序: 接続(再接続)のたびに、サーバーはまず snapshot を送る。その seq を基準にし、seq を持つ
 *   メッセージは基準以下なら捨てる。snapshot より前に届いた seq を持つメッセージも捨てる。
 *   seq を持たない物(transforms・effect・interactRejected・error)はそのまま配る(state-schema.md §7.3)
 * - 再接続: NO_RETRY_CODES 以外で閉じられたら、待ち時間を延ばしながらつなぎ直す。snapshot が届いたら
 *   回数を戻す。上限を超えるか、close() を呼ぶと closed になる
 * - 送信: 開いている間だけ送る。閉じている間の要求は貯めずに捨てる(再接続後の状態と食い違うため)
 */
export const createSessionConnection = ({
  sessionId,
  url = defaultUrl(sessionId),
  createSocket = (u) => new WebSocket(u) as unknown as SocketLike,
  schedule = defaultSchedule,
  maxRetries = 5,
  baseDelayMs = 500,
  maxDelayMs = 8000,
}: SessionConnectionOptions) => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: SocketState = {status: "connecting", closeCode: null};
  const listeners = new Set<() => void>();
  const handlers = new Map<ServerMessageType, Set<(m: never) => void>>();

  let socket: SocketLike | null = null;
  let lastSeq: number | null = null;
  let retries = 0;
  let cancelRetry: (() => void) | null = null;
  let closedByUser = false;

  const set = (next: SocketState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const dispatch = (message: ServerMessage) => {
    const bucket = handlers.get(message.type);
    if (!bucket) {
      return;
    }
    for (const cb of Array.from(bucket)) {
      try {
        (cb as (m: ServerMessage) => void)(message);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const receive = (data: unknown) => {
    let parsed: unknown;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : null;
    } catch {
      parsed = null;
    }
    if (!isServerMessage(parsed)) {
      console.warn("[net] 不明なメッセージを捨てる", data);
      return;
    }
    const seq = seqOf(parsed);
    if (parsed.type === "snapshot") {
      lastSeq = seq;
      retries = 0;
    } else if (seq !== null) {
      if (lastSeq === null || seq <= lastSeq) {
        return;
      }
      lastSeq = seq;
    }
    dispatch(parsed);
  };

  const open = () => {
    lastSeq = null;
    const s = createSocket(url);
    socket = s;
    s.onopen = () => {
      if (socket === s) {
        set({...state, status: "open"});
      }
    };
    s.onmessage = (ev) => {
      if (socket === s) {
        receive(ev.data);
      }
    };
    s.onerror = () => {};
    s.onclose = (ev) => {
      if (socket !== s) {
        return;
      }
      socket = null;
      if (closedByUser) {
        return;
      }
      if (NO_RETRY_CODES.has(ev.code) || retries >= maxRetries) {
        set({status: "closed", closeCode: ev.code});
        return;
      }
      const delay = Math.min(baseDelayMs * 2 ** retries, maxDelayMs);
      retries += 1;
      set({status: "reconnecting", closeCode: ev.code});
      cancelRetry = schedule(() => {
        cancelRetry = null;
        open();
      }, delay);
    };
  };

  open();

  return {
    getState: (): SocketState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <T extends ServerMessageType>(
      type: T,
      callback: (message: ServerMessageOf<T>) => void,
    ) => {
      let bucket = handlers.get(type);
      if (!bucket) {
        bucket = new Set();
        handlers.set(type, bucket);
      }
      bucket.add(callback);
      return () => {
        bucket.delete(callback);
      };
    },
    send: (message: ClientMessage): boolean => {
      if (!socket || socket.readyState !== OPEN) {
        return false;
      }
      socket.send(JSON.stringify(message));
      return true;
    },
    close: () => {
      if (closedByUser) {
        return;
      }
      closedByUser = true;
      cancelRetry?.();
      cancelRetry = null;
      const s = socket;
      socket = null;
      s?.close(CLOSE_NORMAL);
      set({status: "closed", closeCode: CLOSE_NORMAL});
    },
  };
};

export type SessionConnection = ReturnType<typeof createSessionConnection>;
