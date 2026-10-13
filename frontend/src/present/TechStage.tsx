import logoUrl from "../assets/brand/iubeo_logo.svg";
import {archRouteOf, ArchDiagram} from "./ArchDiagram";
import {Icon, type IconName, IconNode} from "./icons";
import {stepIdOf} from "./script";
import {Defs, Edge, Slide} from "./svgParts";
import {CLOSE_LID_DURATION_MS, progress} from "./timeline";

/**
 * 技術パート(目を開ける手前まで)。目を閉じたあとの黒い世界で、構成図と見どころを見せる(中身は評価シートに沿う)。
 * 各手順の図は、手順に入ってから順に現れる
 */
export function TechStage({step, elapsed}: {step: number; elapsed: number}) {
  const id = stepIdOf("tech", step);
  // 構成図の手順はどれも同じ図のまま(マウントし直さずに)光らせる経路だけを変える
  const route = archRouteOf(id);
  if (route !== null) {
    return <ArchDiagram focus={route} />;
  }
  switch (id) {
    case "close":
      return <Title elapsed={elapsed} />;
    case "browser":
      return <InGameBrowser />;
    case "engine":
      return <Engine />;
    case "server":
      return <PerfTuning />;
    case "infra":
      return <Infra />;
    case "cost":
      return <Cost />;
    case "closing":
      return <Closing />;
    default:
      return null;
  }
}

function Title({elapsed}: {elapsed: number}) {
  const shown = progress(elapsed, CLOSE_LID_DURATION_MS + 300, 900);
  return (
    <div className="present-layer present-tech-title" style={{opacity: shown}}>
      <h2>技術・実装の見どころ</h2>
    </div>
  );
}

/** 見どころのスライドの図の幅(横長の画面いっぱいに広げる) */
const SLIDE_W = 1400;

/** 見どころ 1 の 2 段の流れ。アイコンの中心と、横に並ぶアイコンの幅の半分 */
const BROWSER_ROWS: readonly (readonly {
  icons: readonly IconName[];
  title: string;
  cx: number;
}[])[] = [
  [
    {icons: ["firefox", "wasm"], title: "Gecko を Wasm にした", cx: 230},
    {icons: ["relay"], title: "Wisp で中継した", cx: SLIDE_W / 2},
    {icons: ["globe", "brave"], title: "本物の Web", cx: 1170},
  ],
  [
    {icons: ["page"], title: "見ているページ", cx: 230},
    {icons: ["ai"], title: "Workers AI", cx: SLIDE_W / 2},
    {icons: ["check"], title: "お題の判定", cx: 1170},
  ],
];

const BROWSER_ICON = 104;

/** アイコンを横に並べたときの幅の半分(IconRow の間隔と同じ計算) */
const halfWidth = (count: number): number =>
  (count * BROWSER_ICON + (count - 1) * BROWSER_ICON * 0.4) / 2;

function InGameBrowser() {
  return (
    <Slide title="ブラウザの中で本物のブラウザを動かした">
      <svg className="present-svg" viewBox={`0 0 ${SLIDE_W} 560`}>
        <Defs />
        {BROWSER_ROWS.map((row, r) => {
          const cy = r === 0 ? 160 : 380;
          return row.map((node, i) => {
            const next = row[i + 1];
            const x1 = node.cx + halfWidth(node.icons.length) + 20;
            const x2 = next ? next.cx - halfWidth(next.icons.length) - 20 : 0;
            return (
              <g key={node.title}>
                <IconNode
                  names={node.icons}
                  cx={node.cx}
                  cy={cy}
                  size={BROWSER_ICON}
                  title={node.title}
                />
                {next && <Edge d={`M${x1},${cy} L${x2 - 3},${cy}`} />}
              </g>
            );
          });
        })}
      </svg>
    </Slide>
  );
}

/** 見どころ 2 の比較(ADR-0001)。good の側を明るく、そうでない側を暗く出す */
const ENGINE_ROWS: readonly {
  label: string;
  three: string;
  babylon: string;
  good: "three" | "babylon";
}[] = [
  {
    label: "ゲームの機能",
    three: "自分たちで作る",
    babylon: "最初から揃っている",
    good: "babylon",
  },
  {
    label: "機能の量",
    three: "必要な分だけ",
    babylon: "今回には多すぎる",
    good: "three",
  },
  {label: "バンドル", three: "小さい", babylon: "大きい", good: "three"},
  {label: "情報量", three: "多い", babylon: "少ない", good: "three"},
  {
    label: "AI での実装",
    three: "品質が安定",
    babylon: "体感で品質が落ちた",
    good: "three",
  },
];

/** Three.js の上に自分たちで作った、ゲームエンジンが受け持つ部分 */
const ENGINE_PARTS =
  "当たり判定・シーン遷移・ポストプロセス・シェーダー準備・AO ベイク";

function Engine() {
  return (
    <Slide title="Babylon.js ではなく Three.js を選んだ">
      <div className="present-compare">
        <table>
          <thead>
            <tr>
              <th aria-label="項目" />
              <th data-chosen="true">
                <Icon name="three" className="present-compare-icon" />
                Three.js
                <span>採用</span>
              </th>
              <th>
                <Icon name="babylon" className="present-compare-icon" />
                Babylon.js
              </th>
            </tr>
          </thead>
          <tbody>
            {ENGINE_ROWS.map(({label, three, babylon, good}) => (
              <tr key={label}>
                <th>{label}</th>
                <td data-good={good === "three"}>{three}</td>
                <td data-good={good === "babylon"}>{babylon}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>足りない機能は自分たちで作った: {ENGINE_PARTS}</p>
      </div>
    </Slide>
  );
}

/** 小見出しと、その下の項目。value があれば大きく強調する(結果の数字) */
interface Outline {
  heading: string;
  items: readonly {text: string; value?: string}[];
}

/** 縦の箇条書き。小見出しの下に項目を入れ子で並べる */
function OutlineList({outline}: {outline: readonly Outline[]}) {
  return (
    <ul className="present-outline">
      {outline.map(({heading, items}) => (
        <li key={heading}>
          {heading}
          <ul>
            {items.map(({text, value}) => (
              <li key={text}>
                {text}
                {value && <b>{value}</b>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** 見どころ 3。数値は perf/NOTES.md の実測(4G 相当は 4Mbps + CPU 4 倍) */
const PERF: readonly Outline[] = [
  {
    heading: "結果",
    items: [
      {text: "4G で PC のブラウザが使えるまで", value: "93.7 秒 → 1.3 秒"},
      {text: "1 人あたりの受信量", value: "−86%"},
      {text: "JS の転送量", value: "−14%"},
    ],
  },
  {
    heading: "やったこと",
    items: [
      {text: "先に計測の道具を作った"},
      {text: "33 MB の wasm を起動の裏で取っておいた"},
      {text: "位置の通信を 25 バイトのバイナリにした"},
      {text: "three の重複を消した"},
    ],
  },
];

function PerfTuning() {
  return (
    <Slide title="パフォーマンスチューニング">
      <OutlineList outline={PERF} />
    </Slide>
  );
}

/** cloudflare.config.ts の抜粋(一部省略) */
const CONFIG_EXCERPT = `const backendContainer = defineContainer({
  name: "iubeo-backend-app",
  schedulingPolicy: "durable-object",
});

const backendWorker = defineWorker({
  name: "iubeo-backend",
  entrypoint: backendEntry,
  exports: {
    Backend: exports.durableObject({
      container: backendContainer,
    }),
  },
});`;

function Infra() {
  return (
    <Slide title="cf でインフラを TypeScript で書いた">
      <div className="present-infra">
        <div className="present-code">
          <div className="present-code-name">
            <Icon name="typescript" className="present-code-icon" />
            cloudflare.config.ts
          </div>
          <pre>{CONFIG_EXCERPT}</pre>
        </div>
        <div className="present-infra-side">
          <p className="present-infra-lead">
            <Icon name="cloudflare" className="present-infra-icon" />
            cf: Cloudflare の新しい CLI(ベータ)
          </p>
          <ul className="present-infra-points">
            <li>
              Worker 3 つ・コンテナ 2 つ・KV・Workers AI を 1 ファイルにまとめた
            </li>
            <li>
              入口を import で書くので、ファイルを動かすと型検査で気づける
            </li>
          </ul>
        </div>
      </div>
    </Slide>
  );
}

/** 見どころ 5。数値は ADR-0005(常時起動の ECS + ALB は見積もり) */
const COST: readonly Outline[] = [
  {
    heading: "結果",
    items: [
      {text: "常時起動の見積もりと比べた月額", value: "$47 → $4.57"},
      {text: "遊ばれていない間のコンテナ", value: "$0"},
    ],
  },
  {
    heading: "やったこと",
    items: [
      {text: "EC2 は Discord で必要なときだけ起動した"},
      {text: "3 時間で自動で止まるようにした"},
      {text: "普段のコンテナは使われないと眠らせた"},
    ],
  },
];

function Cost() {
  return (
    <Slide title="インフラのコストを削った">
      <OutlineList outline={COST} />
    </Slide>
  );
}

function Closing() {
  return (
    <div className="present-layer present-closing">
      <img src={logoUrl} alt="IUBEO" />
    </div>
  );
}
