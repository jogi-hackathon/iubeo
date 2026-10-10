/** トークン付きの WISP の URL を発行する API（backend/api/openapi.yaml の getWispToken） */
export const WISP_TOKEN_PATH = "/api/v1/wisp/token";

const PLAYER_PATH = "/api/v1/players";

/**
 * 直結の指定を読む。undefined なら「指定なし（トークンを発行してもらう）」、
 * 空文字なら「無効」。`?wisp=` は URL が優先で、無ければ VITE_WISP_URL
 */
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
 * 接続先を決める。直結の指定があればそれ（空なら無効）、無ければトークン付きの URL。
 * 取れなければ undefined（WISP 無しで動かす）。例外は投げない。
 * トークンは、プレイヤーの Cookie がある人にだけ発行される（合言葉は廃止。openapi.yaml の getWispToken）
 */
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

/** 差し替えに使う URL を更新する（トークンを取り直したとき）。undefined なら差し替えない */
export const setFreshWispUrl = (url: string | undefined): void => {
  freshWispUrl = url;
};

/**
 * WebSocket の生成を包み、トークン付きの WISP の URL を開くときは、トークンを freshWispUrl のものに差し替える。
 * エンジンの WISP のクライアント（wisp-js）は、メインスレッドで `new WebSocket(url)` を呼ぶ。
 * ただし wisp-js は、モジュールを評価したときの `globalThis.WebSocket` を持ち続けるので、
 * **エンジンのモジュールを import する前に**包む必要がある（engine.ts の importEngine が呼ぶ）。一度だけ包む
 */
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

/**
 * 画面に出す接続先の表示。トークンを含む URL をそのまま出さないよう、ホスト名だけにする
 */
export const describeWispHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
