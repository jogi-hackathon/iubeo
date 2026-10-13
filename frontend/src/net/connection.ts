import {decodeTransforms, encodeTransform} from "./binary";
import type {
  ClientMessage,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
} from "./types";

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export type SocketState = {
  status: SocketStatus;
  closeCode: number | null;
  closeReason: string | null;
};

export type SocketLike = {
  readonly readyState: number;
  send: (data: string | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: {data: unknown}) => void) | null;
  onclose: ((ev: {code: number; reason?: string}) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

const OPEN = 1;
const CONNECTING = 0;

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
  url?: string;
  createSocket?: (url: string) => SocketLike;
  schedule?: (fn: () => void, ms: number) => () => void;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const defaultUrl = (sessionId: string): string => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/v1/sessions/${encodeURIComponent(sessionId)}/ws?enc=bin`;
};

const defaultCreateSocket = (u: string): SocketLike => {
  const ws = new WebSocket(u);
  ws.binaryType = "arraybuffer";
  return ws as unknown as SocketLike;
};

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export const createSessionConnection = ({
  sessionId,
  url = defaultUrl(sessionId),
  createSocket = defaultCreateSocket,
  schedule = defaultSchedule,
  maxRetries = 5,
  baseDelayMs = 500,
  maxDelayMs = 8000,
}: SessionConnectionOptions) => {
  let state: SocketState = {
    status: "connecting",
    closeCode: null,
    closeReason: null,
  };
  const listeners = new Set<() => void>();
  const handlers = new Map<ServerMessageType, Set<(m: never) => void>>();

  let socket: SocketLike | null = null;
  let lastSeq: number | null = null;
  let retries = 0;
  let cancelRetry: (() => void) | null = null;
  let closedByUser = false;
  const playerOfSeat = new Map<number, string>();

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
    if (data instanceof ArrayBuffer) {
      const transforms = decodeTransforms(data, playerOfSeat);
      if (!transforms) {
        console.warn(
          "[net] 不明なバイナリのメッセージを捨てる",
          data.byteLength,
        );
        return;
      }
      dispatch(transforms);
      return;
    }
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
    if (parsed.type === "snapshot") {
      playerOfSeat.clear();
      for (const p of parsed.session.players ?? []) {
        playerOfSeat.set(p.seat, p.playerId);
      }
    } else if (parsed.type === "player.updated") {
      playerOfSeat.set(parsed.player.seat, parsed.player.playerId);
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
      const closeReason = ev.reason ?? "";
      if (closedByUser) {
        return;
      }
      if (NO_RETRY_CODES.has(ev.code) || retries >= maxRetries) {
        set({status: "closed", closeCode: ev.code, closeReason});
        return;
      }
      const delay = Math.min(baseDelayMs * 2 ** retries, maxDelayMs);
      retries += 1;
      set({status: "reconnecting", closeCode: ev.code, closeReason});
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
      socket.send(
        message.type === "transform"
          ? encodeTransform(message)
          : JSON.stringify(message),
      );
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
      if (s !== null && s.readyState === CONNECTING) {
        // まだ繋がっていないソケットを閉じると、ブラウザが「接続が確立する前に閉じた」とコンソールに警告を出す。
        // 開くのを待ってから閉じる(繋がらなければブラウザ側が閉じる)。
        s.onmessage = null;
        s.onopen = () => s.close(CLOSE_NORMAL);
        s.onerror = () => {};
        s.onclose = () => {};
      } else {
        s?.close(CLOSE_NORMAL);
      }
      set({status: "closed", closeCode: CLOSE_NORMAL, closeReason: ""});
    },
  };
};

export type SessionConnection = ReturnType<typeof createSessionConnection>;
