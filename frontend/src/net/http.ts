import type {
  ApiErrorBody,
  CreateSessionRequest,
  MatchmakingStatus,
  Me,
  SessionSnapshot,
} from "./types";

/** HTTP API が 2xx 以外を返した。code はサーバーの Error.code(本文が読めなければ "unknown") */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
  }
}

export type ApiClientOptions = {
  /** テストで差し替える用。既定はグローバルの fetch */
  fetch?: typeof fetch;
  /**
   * API の起点。既定は同じオリジン(開発時は Vite の proxy がバックエンドへ転送する)。
   * Cookie は同じオリジンにしか付けないので、別オリジンを指すと 401 になる
   */
  baseUrl?: string;
};

const isErrorBody = (v: unknown): v is ApiErrorBody =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as ApiErrorBody).code === "string" &&
  typeof (v as ApiErrorBody).message === "string";

/**
 * HTTP API の薄いラッパー。プレイヤーは HttpOnly Cookie(iubeo_player)で識別するので、
 * 同じオリジンの Cookie を付けて送る(ADR-0003)。2xx 以外は ApiError を投げる
 */
export const createApiClient = ({
  fetch: fetchImpl = (...args) => fetch(...args),
  baseUrl = "",
}: ApiClientOptions = {}) => {
  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : {"Content-Type": "application/json"},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const parsed: unknown = await res.json().catch(() => null);
      throw new ApiError(
        res.status,
        isErrorBody(parsed)
          ? parsed
          : {code: "unknown", message: `HTTP ${res.status}`},
      );
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  };

  return {
    createPlayer: () => request<Me>("POST", "/api/v1/players"),
    getMe: () => request<Me>("GET", "/api/v1/players/me"),
    joinMatchmaking: () =>
      request<MatchmakingStatus>("POST", "/api/v1/matchmaking"),
    getMatchmaking: () =>
      request<MatchmakingStatus>("GET", "/api/v1/matchmaking"),
    leaveMatchmaking: () => request<undefined>("DELETE", "/api/v1/matchmaking"),
    createSession: (body: CreateSessionRequest) =>
      request<SessionSnapshot>("POST", "/api/v1/sessions", body),
    getSession: (sessionId: string) =>
      request<SessionSnapshot>(
        "GET",
        `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
      ),
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
