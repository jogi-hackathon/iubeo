import {after, Slide} from "./svgParts";

/**
 * 技術パートの構成図。docs/assets/arch.png と同じ構成を白い線で描き直し、手順ごとに 1 つの経路だけを光らせる
 * (それ以外は暗くし、光らせた線の上に点を流す)。VC は PNG に無いので、ここで描き足している
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
  ops: "必要なときだけ EC2 を起こす",
};

type Lit = Exclude<ArchRoute, "overview">;

interface ArchNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: readonly string[];
  /** 開発用・フォールバックの物は破線で描く */
  dashed?: boolean;
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

const NODES: readonly ArchNode[] = [
  {
    id: "player",
    x: 10,
    y: 270,
    w: 120,
    h: 80,
    title: "プレイヤー",
    lines: ["Chrome"],
    routes: ["play", "browser", "judge", "vc"],
  },
  {
    id: "frontend",
    x: 185,
    y: 270,
    w: 190,
    h: 80,
    title: "iubeo-frontend",
    lines: ["配信・中継"],
    routes: ["play", "browser", "judge"],
  },
  {
    id: "backend",
    x: 410,
    y: 110,
    w: 190,
    h: 80,
    title: "iubeo-backend",
    lines: ["/api"],
    routes: ["play", "ops"],
  },
  {
    id: "wisp",
    x: 410,
    y: 270,
    w: 190,
    h: 80,
    title: "iubeo-wisp",
    lines: ["/wisp"],
    routes: ["browser", "ops"],
  },
  {
    id: "ai",
    x: 185,
    y: 430,
    w: 190,
    h: 80,
    title: "Workers AI",
    lines: ["/judge(Clef)"],
    routes: ["judge"],
  },
  {
    id: "kv",
    x: 185,
    y: 535,
    w: 190,
    h: 70,
    title: "KV",
    lines: ["target"],
    routes: ["ops"],
  },
  {
    id: "containers",
    x: 410,
    y: 430,
    w: 190,
    h: 80,
    title: "Containers",
    lines: ["開発用・フォールバック"],
    dashed: true,
    routes: ["ops"],
  },
  {
    id: "ec2",
    x: 690,
    y: 150,
    w: 240,
    h: 160,
    title: "EC2",
    lines: ["Go のサーバー :8080", "WISP :8081", "Elastic IP"],
    routes: ["play", "browser", "ops"],
  },
  {
    id: "lambda",
    x: 690,
    y: 430,
    w: 240,
    h: 90,
    title: "Lambda",
    lines: ["起動・停止・自動停止"],
    routes: ["ops"],
  },
  {
    id: "brave",
    x: 990,
    y: 110,
    w: 200,
    h: 70,
    title: "Brave Search API",
    routes: ["browser"],
  },
  {
    id: "web",
    x: 990,
    y: 210,
    w: 200,
    h: 70,
    title: "外部サイト",
    routes: ["browser"],
  },
  {
    id: "vc",
    x: 990,
    y: 330,
    w: 200,
    h: 90,
    title: "ボイスチャット",
    lines: ["MoQ リレー(別ホスト)"],
    routes: ["vc"],
  },
  {
    id: "discord",
    x: 990,
    y: 450,
    w: 200,
    h: 70,
    title: "Discord",
    lines: ["/ec2start /ec2stop"],
    routes: ["ops"],
  },
];

const EDGES: readonly ArchEdge[] = [
  {
    id: "https",
    d: "M130,310 L182,310",
    routes: ["play", "browser", "judge"],
    label: "HTTPS",
    labelAt: [156, 262],
  },
  {id: "api", d: "M375,290 C392,290 392,150 407,150", routes: ["play"]},
  {id: "wisp", d: "M375,310 L407,310", routes: ["browser"]},
  {id: "judge", d: "M280,350 L280,427", routes: ["judge"]},
  {
    id: "backend-ec2",
    d: "M600,150 C645,150 645,200 687,200",
    routes: ["play"],
    label: ":8080",
    labelAt: [645, 140],
  },
  {
    id: "wisp-ec2",
    d: "M600,310 C645,310 645,265 687,265",
    routes: ["browser"],
    label: ":8081",
    labelAt: [645, 330],
  },
  {
    id: "ec2-brave",
    d: "M930,190 C960,190 960,145 987,145",
    routes: ["browser"],
  },
  {id: "ec2-web", d: "M930,235 C960,235 960,245 987,245", routes: ["browser"]},
  {
    id: "player-vc",
    d: "M70,350 L70,628 L1090,628 L1090,423",
    routes: ["vc"],
    label: "QUIC(MoQ)",
    labelAt: [580, 618],
  },
  {
    id: "backend-containers",
    d: "M600,170 L632,170 L632,470 L603,470",
    routes: ["ops"],
    dashed: true,
  },
  {
    id: "wisp-containers",
    d: "M505,350 L505,427",
    routes: ["ops"],
    dashed: true,
  },
  {id: "discord-lambda", d: "M990,485 L933,485", routes: ["ops"]},
  {
    id: "lambda-ec2",
    d: "M810,430 L810,313",
    routes: ["ops"],
    label: "起動 / 停止",
    labelAt: [860, 375],
  },
  {
    id: "lambda-kv",
    d: "M690,500 C640,500 640,570 378,570",
    routes: ["ops"],
    dashed: true,
    label: "target",
    labelAt: [520, 560],
  },
];

const isOn = (focus: ArchRoute, routes: readonly Lit[]): boolean =>
  focus === "overview" || routes.includes(focus);

export function ArchDiagram({focus}: {focus: ArchRoute}) {
  const focused = focus !== "overview";
  return (
    <Slide kicker="全体像" title={TITLES[focus]} titleKey={focus}>
      <svg className="present-svg present-arch-svg" viewBox="0 0 1200 640">
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
        <g className="present-in" style={after(0.2)}>
          <rect
            className="present-group"
            x={160}
            y={20}
            width={460}
            height={595}
            rx={16}
          />
          <text className="present-group-label" x={180} y={50}>
            Cloudflare
          </text>
          <rect
            className="present-group"
            x={665}
            y={20}
            width={290}
            height={595}
            rx={16}
          />
          <text className="present-group-label" x={685} y={50}>
            AWS(東京)
          </text>
        </g>
        {EDGES.map((edge, i) => {
          const on = isOn(focus, edge.routes);
          return (
            <g
              key={edge.id}
              className="present-arch-el"
              data-on={on}
              data-focused={focused && on}
            >
              <path
                className={
                  edge.dashed
                    ? "present-arch-edge present-in"
                    : "present-arch-edge present-draw"
                }
                data-dashed={edge.dashed === true}
                d={edge.d}
                pathLength={edge.dashed ? undefined : 1}
                markerEnd="url(#present-arch-arrow)"
                style={after(0.6 + i * 0.08)}
              />
              {edge.label && edge.labelAt && (
                <text
                  className="present-edge-label present-in"
                  x={edge.labelAt[0]}
                  y={edge.labelAt[1]}
                  textAnchor="middle"
                  style={after(1 + i * 0.08)}
                >
                  {edge.label}
                </text>
              )}
              {/* 光らせた経路にだけ点を流す。経路が変わったら流し直す */}
              {focused && on && (
                <circle key={focus} r={6} className="present-packet">
                  <animateMotion
                    dur="1.4s"
                    repeatCount="indefinite"
                    path={edge.d}
                  />
                </circle>
              )}
            </g>
          );
        })}
        {NODES.map((node, i) => {
          const top =
            node.y + node.h / 2 - ((node.lines?.length ?? 0) * 22) / 2 + 6;
          const on = isOn(focus, node.routes);
          return (
            <g
              key={node.id}
              className="present-arch-el"
              data-on={on}
              data-focused={focused && on}
            >
              <g className="present-in" style={after(0.3 + i * 0.06)}>
                <rect
                  className="present-box present-arch-node"
                  data-dashed={node.dashed === true}
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx={12}
                />
                <text
                  className="present-arch-title"
                  x={node.x + node.w / 2}
                  y={top}
                  textAnchor="middle"
                >
                  {node.title}
                </text>
                {node.lines?.map((line, j) => (
                  <text
                    key={line}
                    className="present-box-sub present-arch-sub"
                    x={node.x + node.w / 2}
                    y={top + 24 + j * 22}
                    textAnchor="middle"
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </svg>
    </Slide>
  );
}
