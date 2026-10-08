/**
 * WISP（実サイトへ出るプロキシ）への接続先を決める。
 *
 * - `?wisp=<url>` か `VITE_WISP_URL` があれば、それを使う（開発の直結。トークンは付けない）。
 *   `?wisp=` と空にすると、その場だけ無効にする
 * - 無ければ、バックエンドに期限つきの URL を発行してもらう（プレイヤーの Cookie が要る）
 */

/** トークン付きの WISP の URL を発行する API（backend/api/openapi.yaml の getWispToken） */
export const WISP_TOKEN_PATH = "/api/v1/wisp/token";

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
): Promise<string | undefined> => {
  if (override !== undefined) {
    return override.trim() || undefined;
  }
  try {
    const response = await fetchFn(WISP_TOKEN_PATH, {
      credentials: "same-origin",
    });
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
 * 画面に出す接続先の表示。トークンを含む URL をそのまま出さないよう、ホスト名だけにする
 */
export const describeWispHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
