import {withPlayerCookie} from "../net/player";

const TUTORIAL_PRESENCE_PATH = "/api/v1/tutorial/presence";
const HEARTBEAT_MS = 30_000;

export const touchTutorialPresence = async (
  fetchFn: typeof fetch = fetch,
): Promise<void> => {
  const res = await withPlayerCookie(fetchFn, () =>
    fetchFn(TUTORIAL_PRESENCE_PATH, {
      method: "POST",
      credentials: "same-origin",
    }),
  ).catch(() => undefined);
  if (res && !res.ok && res.status !== 401) {
    console.warn("[tutorial] presence heartbeat failed:", res.status);
  }
};

export const startTutorialPresenceHeartbeat = (
  fetchFn: typeof fetch = fetch,
): (() => void) => {
  void touchTutorialPresence(fetchFn);
  const id = window.setInterval(() => {
    void touchTutorialPresence(fetchFn);
  }, HEARTBEAT_MS);
  return () => window.clearInterval(id);
};
