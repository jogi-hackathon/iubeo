import {useEffect, useReducer} from "react";

import {barFraction} from "./coverProgress";
import {useCoverState} from "./coverStore";

const TICK_MS = 100;

export function CoverOverlay() {
  const {covered, bar, booting} = useCoverState();
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
        <div className="cover-bar">
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
        <p className="cover-notice">このアプリでは音声が再生されます</p>
      )}
    </div>
  );
}
