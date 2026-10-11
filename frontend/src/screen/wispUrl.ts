export const WISP_TOKEN_PATH = "/api/v1/wisp/token";

const PLAYER_PATH = "/api/v1/players";

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
    let response = await fetchFn(WISP_TOKEN_PATH, tokenInit);
    if (response.status === 401) {
      const created = await fetchFn(PLAYER_PATH, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!created.ok) {
        return undefined;
      }
      response = await fetchFn(WISP_TOKEN_PATH, tokenInit);
    }
    if (!response.ok) {
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
