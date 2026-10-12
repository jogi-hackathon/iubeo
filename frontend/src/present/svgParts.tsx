import type {CSSProperties, ReactNode} from "react";

/** 技術パートの図で使う部品(スライドの枠・箱・線・流れる点) */

/** 要素を delay 秒後にふわっと出す(CSS の .present-in) */
export const after = (delay: number): CSSProperties => ({
  animationDelay: `${delay}s`,
});

export function Slide({
  kicker,
  title,
  titleKey,
  children,
}: {
  kicker: string;
  title: string;
  /** 見出しが変わったときにふわっと出し直すための key(同じスライドのまま見出しだけ変える場合) */
  titleKey?: string;
  children: ReactNode;
}) {
  return (
    <div className="present-layer present-tech">
      <div className="present-kicker present-in">{kicker}</div>
      <h2 key={titleKey} className="present-in" style={after(0.15)}>
        {title}
      </h2>
      <div className="present-tech-body">{children}</div>
    </div>
  );
}

/** 角の丸い箱と、見出し・補足の行 */
export function Box({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  delay,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: readonly string[];
  delay: number;
}) {
  const top = y + h / 2 - (lines.length * 26) / 2;
  return (
    <g className="present-in" style={after(delay)}>
      <rect className="present-box" x={x} y={y} width={w} height={h} rx={14} />
      <text
        className="present-box-title"
        x={x + w / 2}
        y={top}
        textAnchor="middle"
      >
        {title}
      </text>
      {lines.map((line, i) => (
        <text
          key={line}
          className="present-box-sub"
          x={x + w / 2}
          y={top + 30 + i * 24}
          textAnchor="middle"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/** 線を引くように描く(CSS の .present-draw) */
export function Edge({
  d,
  delay,
  label,
  labelAt,
}: {
  d: string;
  delay: number;
  label?: string;
  labelAt?: [number, number];
}) {
  return (
    <g>
      <path
        className="present-draw"
        d={d}
        pathLength={1}
        markerEnd="url(#present-arrow)"
        style={after(delay)}
      />
      {label && labelAt && (
        <text
          className="present-edge-label present-in"
          x={labelAt[0]}
          y={labelAt[1]}
          textAnchor="middle"
          style={after(delay + 0.4)}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** 線の上を流れる点(データが行き来している様子) */
export function Packet({
  path,
  delay,
  dur = 1.6,
}: {
  path: string;
  delay: number;
  dur?: number;
}) {
  return (
    <g className="present-in" style={after(delay)}>
      <circle r={5} className="present-packet">
        <animateMotion
          dur={`${dur}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
          path={path}
        />
      </circle>
    </g>
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
