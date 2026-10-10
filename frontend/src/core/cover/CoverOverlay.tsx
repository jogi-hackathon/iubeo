import {useEffect, useReducer} from "react";

import {barFraction} from "./coverProgress";
import {useCoverState} from "./coverStore";

const TICK_MS = 100;

/**
 * 白い覆い(起動・シェーダーのウォームアップ・シーン遷移)。Canvas・照準・カーソルの上、開発パネルの下に出す。
 * 覆っている間は下の操作を受け付けない。進捗バーは細い灰色の線を中央に出す(文字は出さない)。
 * 同じ z-index の Reticle などより後に DOM を置くこと(App の後ろに置く)
 */
export function CoverOverlay() {
  const {covered, bar} = useCoverState();
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
    </div>
  );
}
