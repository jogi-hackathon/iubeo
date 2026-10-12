const PLAYER_PATH = "/api/v1/players";

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
