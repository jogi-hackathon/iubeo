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

export const resolveWispUrl = async (
  override: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<string | undefined> => {
  if (override !== undefined) {
    return override.trim() || undefined;
  }
  const tokenInit: RequestInit = {credentials: "same-origin"};
  try {
    const response = await withPlayerCookie(fetchFn, () =>
      fetchFn(WISP_TOKEN_PATH, tokenInit),
    );
    if (!response?.ok) {
      return undefined;
    }
    const body = (await response.json()) as {url?: unknown};
    return typeof body.url === "string" && body.url !== ""
      ? body.url
      : undefined;
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

// 起動時に WISP を取れなかったときの再試行間隔。マッチングに入る・セッションが始まるなど、
// あとから発行対象になることがあるので、諦めずに追い続ける。
export const WISP_RETRY_MS = 15_000;

// トークンの期限(5 分)より前に取り直す間隔。
export const WISP_REFRESH_MS = 4 * 60 * 1000;

export interface WispWatcher {
  stop(): void;
}

export interface WispWatchOptions {
  /** 起動時に解決できた URL。取れていないときは、短い間隔で再試行する */
  current?: string;
  onUrl: (url: string) => void;
  fetchFn?: typeof fetch;
  retryMs?: number;
  refreshMs?: number;
}

/**
 * WISP の URL を追い続け、取れたものを onUrl に渡す(取れないままだと onUrl は呼ばれない)。
 *
 * resolveWispUrl は「発行対象外(403)」も「未設定(503)」も undefined にする。つまり 1 回の失敗を
 * 「WISP は無い」と決めつけると、あとから発行対象になっても画面が復帰できない。取れるまで
 * 短い間隔で叩き直し、取れたらトークンの期限が切れる前に取り直す。
 */
export const watchWispUrl = ({
  current,
  onUrl,
  fetchFn = fetch,
  retryMs = WISP_RETRY_MS,
  refreshMs = WISP_REFRESH_MS,
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
    const url = await resolveWispUrl(undefined, fetchFn);
    if (stopped) {
      return;
    }
    if (!url) {
      schedule(retryMs);
      return;
    }
    onUrl(url);
    schedule(refreshMs);
  };

  schedule(current ? refreshMs : retryMs);

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
