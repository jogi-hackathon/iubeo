import {withPlayerCookie} from "../net/player";

const TUTORIAL_PRESENCE_PATH = "/api/v1/tutorial/presence";
const HEARTBEAT_MS = 30_000;

export const touchTutorialPresence = async (
  fetchFn: typeof fetch = fetch,
): Promise<void> => {
  // アプリを開いた直後は Cookie がまだ無い。401 をそのまま捨てると、対象外のままになる
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

/**
 * アプリを開いている間(= PC を使う場面に居る間)、heartbeat を送って WISP トークンの発行対象になる。
 * 送る場所は App(App.tsx)。シーンやチュートリアルの進み具合に依存させない
 * (サンドボックスにも PC がある。チュートリアル完了後〜マッチング開始の間も PC を使う)。
 */
export const startTutorialPresenceHeartbeat = (
  fetchFn: typeof fetch = fetch,
): (() => void) => {
  void touchTutorialPresence(fetchFn);
  const id = window.setInterval(() => {
    void touchTutorialPresence(fetchFn);
  }, HEARTBEAT_MS);
  return () => window.clearInterval(id);
};
