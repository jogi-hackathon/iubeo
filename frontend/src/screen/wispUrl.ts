import {withPlayerCookie} from "../net/player";

export const WISP_TOKEN_PATH = "/api/v1/wisp/token";

export const wispOverrideFrom = (
  search: string,
  envUrl: string | undefined,
): string | undefined => {
  const params = new URLSearchParams(search);
  if (params.has("wisp")) {
    return params.get("wisp") ?? "";
  }
  return envUrl?.trim() || undefined;
};

export type ResolvedWisp = {
  url: string;
  expiresAt?: string;
};

export const resolveWispUrl = async (
  override: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedWisp | undefined> => {
  if (override !== undefined) {
    const url = override.trim();
    return url ? {url} : undefined;
  }
  const tokenInit: RequestInit = {credentials: "same-origin"};
  try {
    const response = await withPlayerCookie(fetchFn, () =>
      fetchFn(WISP_TOKEN_PATH, tokenInit),
    );
    if (!response?.ok) {
      return undefined;
    }
    const body = (await response.json()) as {
      url?: unknown;
      expiresAt?: unknown;
    };
    if (typeof body.url !== "string" || body.url === "") {
      return undefined;
    }
    return {
      url: body.url,
      expiresAt:
        typeof body.expiresAt === "string" ? body.expiresAt : undefined,
    };
  } catch {
    return undefined;
  }
};

/**
 * WebSocket を開く先が、トークン付きの WISP の URL（`fresh` と同じ場所で、token を持つ）なら、
 * トークンを `fresh` のものに差し替えた URL を返す。それ以外はそのまま返す。
 * エンジンは起動時に受け取った URL を持ち続け、最初の通信で初めて接続するので、そのときには期限が切れていることがある。
 * WISP のクライアントは末尾に "/" を足して開くので、元に "/" があれば付け直す
 */
export const replaceWispToken = (target: string, fresh: string): string => {
  let to: URL;
  let from: URL;
  try {
    to = new URL(target);
    from = new URL(fresh);
  } catch {
    return target;
  }
  if (
    to.protocol !== from.protocol ||
    to.host !== from.host ||
    to.pathname !== from.pathname ||
    !to.searchParams.has("token")
  ) {
    return target;
  }
  return target.endsWith("/") && !fresh.endsWith("/") ? `${fresh}/` : fresh;
};

export const WISP_RETRY_MS = 15_000;

export const WISP_REFRESH_MARGIN_MS = 60_000;

export const refreshDelayMs = (
  expiresAt: string | undefined,
  now = Date.now(),
): number | undefined => {
  if (!expiresAt) {
    return undefined;
  }
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    return undefined;
  }
  return Math.max(0, expiry - WISP_REFRESH_MARGIN_MS - now);
};

export interface WispWatcher {
  stop(): void;
}

export interface WispWatchOptions {
  expiresAt?: string;
  onUrl: (url: string) => void;
  fetchFn?: typeof fetch;
  retryMs?: number;
}

export const watchWispUrl = ({
  expiresAt,
  onUrl,
  fetchFn = fetch,
  retryMs = WISP_RETRY_MS,
}: WispWatchOptions): WispWatcher => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (delayMs: number): void => {
    timer = setTimeout(() => {
      void check();
    }, delayMs);
  };

  const check = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    const resolved = await resolveWispUrl(undefined, fetchFn);
    if (stopped) {
      return;
    }
    if (!resolved) {
      schedule(retryMs);
      return;
    }
    onUrl(resolved.url);
    schedule(refreshDelayMs(resolved.expiresAt) ?? retryMs);
  };

  schedule(refreshDelayMs(expiresAt) ?? retryMs);

  return {
    stop: (): void => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
};

let freshWispUrl: string | undefined;

export const setFreshWispUrl = (url: string | undefined): void => {
  freshWispUrl = url;
};

export const installWispTokenRewrite = (): void => {
  const w = globalThis as typeof globalThis & {__wispTokenPatched?: boolean};
  if (w.__wispTokenPatched || typeof w.WebSocket !== "function") {
    return;
  }
  w.__wispTokenPatched = true;
  w.WebSocket = new Proxy(w.WebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>) {
      const [url, ...rest] = args;
      const next = freshWispUrl
        ? replaceWispToken(String(url), freshWispUrl)
        : url;
      return Reflect.construct(target, [next, ...rest]) as WebSocket;
    },
  });
};

export const describeWispHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
