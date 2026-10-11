const TUTORIAL_PRESENCE_PATH = "/api/v1/tutorial/presence";
const HEARTBEAT_MS = 30_000;

export const touchTutorialPresence = (
  fetchFn: typeof fetch = fetch,
): Promise<void> =>
  fetchFn(TUTORIAL_PRESENCE_PATH, {
    method: "POST",
    credentials: "same-origin",
  }).then((res) => {
    if (!res.ok && res.status !== 401) {
      console.warn("[tutorial] presence heartbeat failed:", res.status);
    }
  });

/** チュートリアル中だけ heartbeat を送り、WISP トークン発行の対象になる。 */
export const startTutorialPresenceHeartbeat = (
  fetchFn: typeof fetch = fetch,
): (() => void) => {
  void touchTutorialPresence(fetchFn);
  const id = window.setInterval(() => {
    void touchTutorialPresence(fetchFn);
  }, HEARTBEAT_MS);
  return () => window.clearInterval(id);
};
