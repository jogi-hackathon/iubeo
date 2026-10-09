/**
 * WISP（実サイトへ出るプロキシ）への接続先を決める。
 *
 * - `?wisp=<url>` か `VITE_WISP_URL` があれば、それを使う（開発の直結。トークンは付けない）。
 *   `?wisp=` と空にすると、その場だけ無効にする
 * - 無ければ、バックエンドに期限つきの URL を発行してもらう（プレイヤーの Cookie が要る）。
 *   バックエンドに合言葉（IUBEO_WISP_PASS）があれば、`?wisppass=<合言葉>` で開いたときだけ発行される
 */

/** トークン付きの WISP の URL を発行する API（backend/api/openapi.yaml の getWispToken） */
export const WISP_TOKEN_PATH = "/api/v1/wisp/token";

/** 匿名プレイヤーを作って Cookie を発行する API(createPlayer) */
const PLAYER_PATH = "/api/v1/players";

/** 合言葉を送るヘッダー（openapi.yaml の getWispToken） */
export const WISP_PASS_HEADER = "X-Iubeo-Wisp-Pass";
/** 合言葉を、タブを閉じるまで覚えておく場所（sessionStorage のキー） */
const WISP_PASS_STORAGE_KEY = "iubeo.wispPass";

/**
 * 合言葉を読む。`?wisppass=` があれば覚えて使い、無ければ覚えていたもの。無ければ undefined。
 * 覚えておくのは、ゲームの中でページを移っても（?wisppass= が URL から消えても）使えるようにするため
 */
export const wispPassFrom = (
  search: string,
  storage:
    | Pick<Storage, "getItem" | "setItem">
    | undefined = sessionStorageOrUndefined(),
): string | undefined => {
  const given = new URLSearchParams(search).get("wisppass");
  try {
    if (given) {
      storage?.setItem(WISP_PASS_STORAGE_KEY, given);
      return given;
    }
    return storage?.getItem(WISP_PASS_STORAGE_KEY) || undefined;
  } catch {
    return given || undefined;
  }
};

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

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
 * 取れなければ undefined（WISP 無しで動かす）。例外は投げない
 */
export const resolveWispUrl = async (
  override: string | undefined,
  fetchFn: typeof fetch = fetch,
  pass?: string,
): Promise<string | undefined> => {
  if (override !== undefined) {
    return override.trim() || undefined;
  }
  const tokenInit: RequestInit = pass
    ? {credentials: "same-origin", headers: {[WISP_PASS_HEADER]: pass}}
    : {credentials: "same-origin"};
  try {
    let response = await fetchFn(WISP_TOKEN_PATH, tokenInit);
    if (response.status === 401) {
      // Cookie がまだ無い(セッションに入る前)なら、匿名のプレイヤーを作ってから 1 回だけ取り直す
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

/**
 * いま使える、トークン付きの WISP の URL。エンジンが WebSocket を開くとき、これのトークンに差し替える
 * （installWispTokenRewrite）。エンジンは 1 つだけなので、モジュールで 1 つ持つ
 */
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
