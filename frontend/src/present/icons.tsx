import {siBrave, siDiscord, siThreedotjs} from "simple-icons";

import awsUrl from "./logos/aws.svg";
import chromeUrl from "./logos/chrome.svg";
import cloudflareUrl from "./logos/cloudflare.svg";
import dockerUrl from "./logos/docker.svg";
import ec2Url from "./logos/ec2.svg";
import goUrl from "./logos/go.svg";
import lambdaUrl from "./logos/lambda.svg";
import workersUrl from "./logos/workers.svg";

/**
 * 技術パートの図に添えるアイコン。製品は公式のロゴ(logos/ の SVG、無い物は simple-icons のパスとブランドの色)、
 * ロゴの無い概念は線で描く。どれも 24 × 24 の座標で、正方形に収める
 */

const LOGOS = {
  aws: awsUrl,
  chrome: chromeUrl,
  cloudflare: cloudflareUrl,
  docker: dockerUrl,
  ec2: ec2Url,
  go: goUrl,
  lambda: lambdaUrl,
  workers: workersUrl,
} as const;

/** Three.js のロゴは黒一色なので、黒い背景では白にする */
const BRANDS = {
  brave: {d: siBrave.path, color: `#${siBrave.hex}`},
  discord: {d: siDiscord.path, color: `#${siDiscord.hex}`},
  three: {d: siThreedotjs.path, color: "#fff"},
} as const;

const CLOUDFLARE = "#F38020";
const WHITE = "#fff";

/** 線で描くアイコン。Cloudflare の物は Cloudflare の色にする */
const GLYPHS = {
  ai: {
    d: "M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z",
    color: CLOUDFLARE,
  },
  db: {
    d: "M4 5.5c0 1.7 3.6 3 8 3s8-1.3 8-3s-3.6-3-8-3s-8 1.3-8 3v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
    color: CLOUDFLARE,
  },
  globe: {
    d: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18",
    color: WHITE,
  },
  mic: {
    d: "M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
    color: WHITE,
  },
} as const;

export type IconName =
  | keyof typeof LOGOS
  | keyof typeof BRANDS
  | keyof typeof GLYPHS;

function IconBody({name}: {name: IconName}) {
  if (name in LOGOS) {
    return (
      <image href={LOGOS[name as keyof typeof LOGOS]} width={24} height={24} />
    );
  }
  if (name in BRANDS) {
    const {d, color} = BRANDS[name as keyof typeof BRANDS];
    return <path d={d} fill={color} />;
  }
  const {d, color} = GLYPHS[name as keyof typeof GLYPHS];
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** SVG の中では x / y の位置に、HTML の中では className の大きさで描く */
export function Icon({
  name,
  x,
  y,
  size,
  className,
}: {
  name: IconName;
  x?: number;
  y?: number;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <IconBody name={name} />
    </svg>
  );
}

/** アイコンを横に並べる。cx を中心に、上端を y にそろえる */
export function IconRow({
  names,
  cx,
  y,
  size,
  gap = size * 0.4,
}: {
  names: readonly IconName[];
  cx: number;
  y: number;
  size: number;
  gap?: number;
}) {
  const width = names.length * size + (names.length - 1) * gap;
  const left = cx - width / 2;
  return (
    <>
      {names.map((name, i) => (
        <Icon
          key={name}
          name={name}
          x={left + i * (size + gap)}
          y={y}
          size={size}
        />
      ))}
    </>
  );
}

/** 枠を付けずに、アイコンの下に名前を置く。cx, cy はアイコンの中心 */
export function IconNode({
  names,
  cx,
  cy,
  size,
  title,
  className = "present-box-title",
}: {
  names: readonly IconName[];
  cx: number;
  cy: number;
  size: number;
  title: string;
  className?: string;
}) {
  return (
    <>
      <IconRow names={names} cx={cx} y={cy - size / 2} size={size} />
      <text
        className={className}
        x={cx}
        y={cy + size / 2 + 26}
        textAnchor="middle"
      >
        {title}
      </text>
    </>
  );
}
