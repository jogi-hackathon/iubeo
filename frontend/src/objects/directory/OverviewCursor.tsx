import {useEffect, useRef} from "react";

import {CURSOR_ARROW_PATH} from "../../core/input/virtualCursor";
import {getCursor, subscribeCursor} from "./cursorStore";
import {useOverviewPhase} from "./overview";

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
      <path
        d={CURSOR_ARROW_PATH}
        fill="#ffffff"
        stroke="#1a1a1a"
        strokeLinejoin="round"
      />
    </svg>
  );
}
