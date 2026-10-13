import {withPlayerCookie} from "../../../../net/player";

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

/**
 * backend が返す WISP の URL の host は、backend のコンテナを起動した最初のリクエストの origin になる。
 * 展示用スタックでは複数の PR プレビューが同じ backend を使うので、同じオリジン配下(/wisp/)を指す URL は
 * 今のページの host に付け直す。別ホストの WISP(パスが /wisp/ でないもの)はそのまま返す
 */
export const rebaseWispUrl = (
  url: string,
  pageHref: string | undefined,
): string => {
  if (!pageHref) {
    return url;
  }
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith("/wisp/")) {
      return url;
    }
    const page = new URL(pageHref);
    u.protocol = page.protocol === "https:" ? "wss:" : "ws:";
    u.host = page.host;
    return u.toString();
  } catch {
    return url;
  }
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
      url: rebaseWispUrl(body.url, globalThis.location?.href),
      expiresAt:
        typeof body.expiresAt === "string" ? body.expiresAt : undefined,
    };
  } catch {
    return undefined;
  }
};

/**
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

export const searchTokenFrom = (wispUrl: string | undefined): string => {
  if (!wispUrl) {
    return "";
  }
  try {
    return new URL(wispUrl).searchParams.get("token") ?? "";
  } catch {
    return "";
  }
};

export const currentSearchToken = (): string => searchTokenFrom(freshWispUrl);

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
