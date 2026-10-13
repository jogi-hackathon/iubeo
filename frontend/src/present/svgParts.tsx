import type {ReactNode} from "react";

/** 技術パートの図で使う部品(スライドの枠)。手順が変わっても出現のアニメーションはせず、そのまま出す */

export function Slide({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="present-layer present-tech">
      <h2>{title}</h2>
      <div className="present-tech-body">{children}</div>
    </div>
  );
}
