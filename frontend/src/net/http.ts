import type {
  ApiErrorBody,
  CreateSessionRequest,
  MatchmakingStatus,
  Me,
  SessionSnapshot,
} from "./types";

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
  fetch?: typeof fetch;
  baseUrl?: string;
};

const isErrorBody = (v: unknown): v is ApiErrorBody =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as ApiErrorBody).code === "string" &&
  typeof (v as ApiErrorBody).message === "string";

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
