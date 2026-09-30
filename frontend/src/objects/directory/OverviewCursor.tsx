import {useEffect, useRef} from "react";

import {getCursor, subscribeCursor} from "./cursorStore";
import {useOverviewPhase} from "./overview";

// OS 風のマウスポインタ。白塗りに暗い縁取りで、白い世界でも見える。先端(0,0)がカーソル位置
const ARROW = "M1 1 L1 19 L5.2 15 L8.4 22.4 L11.4 21.1 L8.2 13.9 L14 13.9 Z";

/**
 * 俯瞰中の仮想カーソル(DOM オーバーレイ)。俯瞰が active の間だけ表示する。
 * 位置は毎フレーム動くので、再レンダーせず、ref で style.transform を直接書く
 */
export function OverviewCursor() {
  const phase = useOverviewPhase();
  const ref = useRef<SVGSVGElement>(null);
  const visible = phase === "active";

  useEffect(() => {
    if (!visible) {
      return;
    }
    const update = () => {
      const el = ref.current;
      if (!el) {
        return;
      }
      const {x, y} = getCursor();
      const px = ((x + 1) / 2) * window.innerWidth;
      const py = ((1 - y) / 2) * window.innerHeight;
      el.style.transform = `translate(${px}px, ${py}px)`;
    };
    update();
    return subscribeCursor(update);
  }, [visible]);

  if (!visible) {
    return null;
  }
  return (
    <svg
      ref={ref}
      width={16}
      height={24}
      viewBox="0 0 16 24"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10000,
      }}
    >
      <path d={ARROW} fill="#ffffff" stroke="#1a1a1a" strokeLinejoin="round" />
    </svg>
  );
}
