import {Icon, type IconName, IconNode} from "./icons";
import {Slide} from "./svgParts";

/**
 * 技術パートの構成図。docs/assets/arch.png と同じ構成を白い線で描き直し、手順ごとに 1 つの経路だけを光らせる
 * (それ以外は暗くする)。VC は PNG に無いので、ここで描き足している
 */

/** 光らせる経路。overview は全体を見せるだけ */
export type ArchRoute =
  | "overview"
  | "play"
  | "browser"
  | "judge"
  | "vc"
  | "ops";

const ROUTE_OF_STEP: Record<string, ArchRoute> = {
  arch: "overview",
  "arch-play": "play",
  "arch-browser": "browser",
  "arch-judge": "judge",
  "arch-vc": "vc",
  "arch-ops": "ops",
};

/** 技術パートの手順 id が構成図の手順なら、光らせる経路。違えば null */
export const archRouteOf = (stepId: string): ArchRoute | null =>
  ROUTE_OF_STEP[stepId] ?? null;

const TITLES: Record<ArchRoute, string> = {
  overview: "インフラ構成",
  play: "ゲームの通信",
  browser: "ゲーム内ブラウザの通信",
  judge: "検索の判定",
  vc: "ボイスチャット",
  ops: "必要なときだけ EC2 を起こすようにした",
};

type Lit = Exclude<ArchRoute, "overview">;

interface ArchNode {
  id: string;
  /** アイコンの中心 */
  cx: number;
  cy: number;
  title: string;
  icons: readonly IconName[];
  routes: readonly Lit[];
}

interface ArchEdge {
  id: string;
  d: string;
  routes: readonly Lit[];
  dashed?: boolean;
  label?: string;
  labelAt?: readonly [number, number];
}

/** ノードのアイコンの大きさ */
const ICON_SIZE = 64;
/** 横の線はアイコンの手前で止める(中心からの距離。2 つ並ぶ EC2 は IconRow の幅から) */
const H = ICON_SIZE / 2 + 14;
const EC2_H = (ICON_SIZE * 2.4) / 2 + 14;
/** 縦の線は、上のノードの名前の下から、下のノードのアイコンの手前まで */
const BELOW = ICON_SIZE / 2 + 38;
const ABOVE = ICON_SIZE / 2 + 14;

/** 横長の画面いっぱいに広げる図の幅と、列の x */
const WIDTH = 1700;
const PLAYER = 80;
const FRONT = 380;
const MID = 700;
const EC2 = 1150;
const RIGHT = 1560;
/** 列の間で曲がる線の折り返し */
const MID_EC2 = (MID + EC2) / 2;
const EC2_RIGHT = (EC2 + RIGHT) / 2;

/** Cloudflare・AWS の範囲(破線の枠) */
const CF_GROUP = {x: 230, w: 630};
const AWS_GROUP = {x: 960, w: 380};

const NODES: readonly ArchNode[] = [
  {
    id: "player",
    cx: PLAYER,
    cy: 300,
    title: "プレイヤー",
    icons: ["chrome"],
    routes: ["play", "browser", "judge", "vc"],
  },
  {
    id: "frontend",
    cx: FRONT,
    cy: 300,
    title: "frontend",
    icons: ["workers"],
    routes: ["play", "browser", "judge"],
  },
  {
    id: "backend",
    cx: MID,
    cy: 140,
    title: "backend",
    icons: ["workers"],
    routes: ["play", "ops"],
  },
  {
    id: "wisp",
    cx: MID,
    cy: 300,
    title: "wisp",
    icons: ["workers"],
    routes: ["browser", "ops"],
  },
  {
    id: "ai",
    cx: FRONT,
    cy: 440,
    title: "Workers AI",
    icons: ["ai"],
    routes: ["judge"],
  },
  {
    id: "kv",
    cx: FRONT,
    cy: 555,
    title: "KV",
    icons: ["db"],
    routes: ["ops"],
  },
  {
    id: "containers",
    cx: MID,
    cy: 440,
    title: "Containers",
    icons: ["docker"],
    routes: ["ops"],
  },
  {
    id: "ec2",
    cx: EC2,
    cy: 220,
    title: "EC2",
    icons: ["ec2", "go"],
    routes: ["play", "browser", "ops"],
  },
  {
    id: "lambda",
    cx: EC2,
    cy: 440,
    title: "Lambda",
    icons: ["lambda"],
    routes: ["ops"],
  },
  {
    id: "brave",
    cx: RIGHT,
    cy: 120,
    title: "Brave Search",
    icons: ["brave"],
    routes: ["browser"],
  },
  {
    id: "web",
    cx: RIGHT,
    cy: 240,
    title: "Web",
    icons: ["globe"],
    routes: ["browser"],
  },
  {
    id: "discord",
    cx: RIGHT,
    cy: 440,
    title: "Discord",
    icons: ["discord"],
    routes: ["ops"],
  },
  {
    id: "vc",
    cx: RIGHT,
    cy: 555,
    title: "VC リレー",
    icons: ["mic"],
    routes: ["vc"],
  },
];

const EDGES: readonly ArchEdge[] = [
  {
    id: "https",
    d: `M${PLAYER + H},300 L${FRONT - H},300`,
    routes: ["play", "browser", "judge"],
    label: "HTTPS",
    labelAt: [(PLAYER + FRONT) / 2, 288],
  },
  {
    id: "api",
    d: `M${FRONT + H},300 C${FRONT + 140},300 ${MID - 140},140 ${MID - H},140`,
    routes: ["play"],
  },
  {id: "wisp", d: `M${FRONT + H},300 L${MID - H},300`, routes: ["browser"]},
  {
    id: "judge",
    d: `M${FRONT},${300 + BELOW} L${FRONT},${440 - ABOVE}`,
    routes: ["judge"],
  },
  {
    id: "backend-ec2",
    d: `M${MID + H},140 C${MID_EC2},140 ${MID_EC2},210 ${EC2 - EC2_H},210`,
    routes: ["play"],
    label: ":8080",
    labelAt: [MID_EC2, 160],
  },
  {
    id: "wisp-ec2",
    d: `M${MID + H},300 C${MID_EC2},300 ${MID_EC2},230 ${EC2 - EC2_H},230`,
    routes: ["browser"],
    label: ":8081",
    labelAt: [MID_EC2, 296],
  },
  {
    id: "ec2-brave",
    d: `M${EC2 + EC2_H},210 C${EC2_RIGHT},210 ${EC2_RIGHT},120 ${RIGHT - H},120`,
    routes: ["browser"],
  },
  {
    id: "ec2-web",
    d: `M${EC2 + EC2_H},230 C${EC2_RIGHT},230 ${EC2_RIGHT},240 ${RIGHT - H},240`,
    routes: ["browser"],
  },
  {
    id: "player-vc",
    d: `M${PLAYER},${300 + BELOW} L${PLAYER},650 L${RIGHT - 150},650 C${RIGHT - 100},650 ${RIGHT - 130},555 ${RIGHT - 80},555 L${RIGHT - H},555`,
    routes: ["vc"],
    label: "QUIC",
    labelAt: [(PLAYER + RIGHT) / 2, 640],
  },
  {
    id: "backend-containers",
    d: `M${MID + H},152 L${MID + 95},152 L${MID + 95},440 L${MID + H},440`,
    routes: ["ops"],
    dashed: true,
  },
  {
    id: "wisp-containers",
    d: `M${MID},${300 + BELOW} L${MID},${440 - ABOVE}`,
    routes: ["ops"],
    dashed: true,
  },
  {
    id: "discord-lambda",
    d: `M${RIGHT - H},440 L${EC2 + H},440`,
    routes: ["ops"],
  },
  {
    id: "lambda-ec2",
    d: `M${EC2},${440 - ABOVE} L${EC2},${220 + BELOW}`,
    routes: ["ops"],
    label: "起動 / 停止",
    labelAt: [EC2 + 60, 350],
  },
  {
    id: "lambda-kv",
    d: `M${EC2 - H},455 C${EC2 - 160},452 ${EC2 - 160},555 ${FRONT + H},555`,
    routes: ["ops"],
    dashed: true,
    label: "target",
    labelAt: [(FRONT + EC2) / 2, 545],
  },
];

const isOn = (focus: ArchRoute, routes: readonly Lit[]): boolean =>
  focus === "overview" || routes.includes(focus);

export function ArchDiagram({focus}: {focus: ArchRoute}) {
  const focused = focus !== "overview";
  return (
    <Slide title={TITLES[focus]}>
      <svg
        className="present-svg present-arch-svg"
        viewBox={`0 0 ${WIDTH} 670`}
      >
        <defs>
          <marker
            id="present-arch-arrow"
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
        <g>
          <rect
            className="present-group"
            x={CF_GROUP.x}
            y={20}
            width={CF_GROUP.w}
            height={615}
            rx={16}
          />
          <Icon name="cloudflare" x={CF_GROUP.x + 18} y={26} size={34} />
          <text className="present-group-label" x={CF_GROUP.x + 58} y={50}>
            Cloudflare
          </text>
          <rect
            className="present-group"
            x={AWS_GROUP.x}
            y={20}
            width={AWS_GROUP.w}
            height={615}
            rx={16}
          />
          <Icon name="aws" x={AWS_GROUP.x + 15} y={22} size={40} />
          <text className="present-group-label" x={AWS_GROUP.x + 61} y={50}>
            東京
          </text>
        </g>
        {EDGES.map((edge) => {
          const on = isOn(focus, edge.routes);
          return (
            <g
              key={edge.id}
              className="present-arch-el"
              data-on={on}
              data-focused={focused && on}
            >
              <path
                className="present-arch-edge"
                data-dashed={edge.dashed === true}
                d={edge.d}
                markerEnd="url(#present-arch-arrow)"
              />
              {edge.label && edge.labelAt && (
                <text
                  className="present-edge-label"
                  x={edge.labelAt[0]}
                  y={edge.labelAt[1]}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {NODES.map((node) => {
          const on = isOn(focus, node.routes);
          return (
            <g
              key={node.id}
              className="present-arch-el"
              data-on={on}
              data-focused={focused && on}
            >
              <IconNode
                names={node.icons}
                cx={node.cx}
                cy={node.cy}
                size={ICON_SIZE}
                title={node.title}
                className="present-arch-title"
              />
            </g>
          );
        })}
      </svg>
    </Slide>
  );
}
