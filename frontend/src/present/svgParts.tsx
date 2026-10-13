import type {ReactNode} from "react";

/** 技術パートの図で使う部品(スライドの枠・線)。手順が変わっても出現のアニメーションはせず、そのまま出す */

export function Slide({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="present-layer present-tech">
      <h2>{title}</h2>
      <div className="present-tech-body">{children}</div>
    </div>
  );
}

/** 矢印の付いた線 */
export function Edge({d}: {d: string}) {
  return (
    <path className="present-edge" d={d} markerEnd="url(#present-arrow)" />
  );
}

export function Defs() {
  return (
    <defs>
      <marker
        id="present-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
      </marker>
    </defs>
  );
}
