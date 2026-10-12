const PLAYER_PATH = "/api/v1/players";

/**
 * 送信して、Cookie が無い(401)ときだけ匿名のプレイヤーを作って 1 回やり直す。
 *
 * サーバーの認証はプレイヤーの Cookie なので、これが無いとアプリを開いた直後の
 * 最初の 1 回が必ず 401 で落ちる(WISP のトークン・チュートリアルの heartbeat など)。
 * 作ってあるかどうかは 401 かどうかで判断するので、余計な POST はしない。
 */
export const withPlayerCookie = async (
  fetchFn: typeof fetch,
  send: () => Promise<Response>,
): Promise<Response | undefined> => {
  const first = await send();
  if (first.status !== 401) {
    return first;
  }
  const created = await fetchFn(PLAYER_PATH, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!created.ok) {
    return undefined;
  }
  return send();
};
