import {useEffect, useReducer} from "react";

import {audioManager} from "../audio/audioManager";
import {audioSettingsStore} from "../audioSettings";
import {barFraction} from "./coverProgress";
import {coverStore, useCoverState} from "./coverStore";

const TICK_MS = 100;

export function CoverOverlay() {
  const {covered, bar, booting, consented, awaitingConsent} = useCoverState();
  const barShown = bar !== null;
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!barShown) {
      return;
    }
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [barShown]);

  return (
    <div className="cover-overlay" data-covered={covered}>
      {bar && (
        <div className="cover-bar" data-hidden={awaitingConsent || !covered}>
          <div
            className="cover-bar-fill"
            style={{
              width: `${
                barFraction({
                  done: bar.done,
                  total: bar.total,
                  elapsedMs: performance.now() - bar.since,
                }) * 100
              }%`,
            }}
          />
        </div>
      )}
      {booting && (
        <div className="cover-notice" data-shown={awaitingConsent}>
          <p>このアプリでは音声が再生されます</p>
          <button
            type="button"
            disabled={consented}
            onClick={() => {
              audioManager.context();
              audioManager.setMuted(false);
              audioManager.unlock();
              audioSettingsStore.set({
                ...audioSettingsStore.get(),
                soundNoticeAccepted: true,
              });
              coverStore.setConsented(true);
            }}
          >
            {consented ? "準備しています…" : "了承して始める"}
          </button>
        </div>
      )}
    </div>
  );
}
