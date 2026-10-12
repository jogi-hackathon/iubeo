import logoUrl from "../assets/brand/iubeo_logo.svg";
import {archRouteOf, ArchDiagram} from "./ArchDiagram";
import {stepIdOf} from "./script";
import {after, Box, Defs, Edge, Packet, Slide} from "./svgParts";
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
      return <ServerAndMeasure />;
    case "infra":
      return <Infra />;
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

function InGameBrowser() {
  return (
    <Slide kicker="見どころ 1" title="ブラウザの中で、本物のブラウザを動かす">
      <svg className="present-svg" viewBox="0 0 1000 560">
        <Defs />
        <text
          className="present-row-label present-in"
          x={30}
          y={30}
          style={after(0.3)}
        >
          ネットを見る
        </text>
        <Box
          x={30}
          y={50}
          w={280}
          h={150}
          title="PC の画面"
          lines={["Gecko を WebAssembly に", "(firefox-wasm をフォーク)"]}
          delay={0.4}
        />
        <Box
          x={385}
          y={50}
          w={230}
          h={150}
          title="Wisp"
          lines={["WebSocket の上で", "TCP / UDP を中継"]}
          delay={0.9}
        />
        <Box
          x={690}
          y={50}
          w={280}
          h={150}
          title="実際の Web"
          lines={["検索は Brave Search API", "で自前の検索画面"]}
          delay={1.4}
        />
        <Edge d="M310,125 L382,125" delay={0.9} />
        <Edge d="M615,125 L687,125" delay={1.4} />
        <Packet path="M310,125 L385,125" delay={1.9} dur={0.8} />
        <Packet path="M615,125 L690,125" delay={2.3} dur={0.8} />
        <text
          className="present-row-label present-in"
          x={30}
          y={270}
          style={after(2.2)}
        >
          お題に合っているか
        </text>
        <Box
          x={30}
          y={290}
          w={280}
          h={150}
          title="見ているページ"
          lines={["タイトル・本文"]}
          delay={2.3}
        />
        <Box
          x={385}
          y={290}
          w={230}
          h={150}
          title="Workers AI"
          lines={["Clef が質問ごとに", "構造化して判定"]}
          delay={2.7}
        />
        <Box
          x={690}
          y={290}
          w={280}
          h={150}
          title="合えば成果物"
          lines={["外れると画面が乱れて", "理由が出る"]}
          delay={3.1}
        />
        <Edge d="M310,365 L382,365" delay={2.7} />
        <Edge d="M615,365 L687,365" delay={3.1} />
        <Packet path="M310,365 L385,365" delay={3.5} dur={0.8} />
        <Packet path="M615,365 L690,365" delay={3.9} dur={0.8} />
        <text
          className="present-caption present-in"
          x={500}
          y={520}
          textAnchor="middle"
          style={after(4.2)}
        >
          元の firefox-wasm は JIT が弱く日本語も出せなかった →
          計測と改善を繰り返した
        </text>
      </svg>
    </Slide>
  );
}

/** Three.js の上に自分たちで積んだ、ゲームエンジンが受け持つ部分 */
const ENGINE_PARTS = [
  ["当たり判定と", "一人称の移動"],
  ["シーン管理と", "画面遷移"],
  ["TSL の", "ポストプロセス"],
  ["シェーダーの", "ウォームアップ"],
  ["AO の", "GPU ベイク"],
  ["差し替えられる", "オーソリティ"],
] as const;

function Engine() {
  return (
    <Slide kicker="見どころ 2" title="Three.js を、ゲームエンジンにする">
      <svg className="present-svg" viewBox="0 0 1000 560">
        <g className="present-in" style={after(0.4)}>
          <rect
            className="present-box present-base"
            x={60}
            y={380}
            width={880}
            height={80}
            rx={14}
          />
          <text
            className="present-box-title"
            x={500}
            y={428}
            textAnchor="middle"
          >
            Three.js(WebGPU)+ React Three Fiber + three-mesh-bvh
          </text>
        </g>
        {ENGINE_PARTS.map(([a, b], i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 60 + col * 300;
          const y = row === 0 ? 240 : 110;
          return (
            <g
              key={a + b}
              className="present-drop"
              style={after(0.9 + i * 0.35)}
            >
              <rect
                className="present-box"
                x={x}
                y={y}
                width={280}
                height={115}
                rx={12}
              />
              <text
                className="present-box-title present-small"
                x={x + 140}
                y={y + 50}
                textAnchor="middle"
              >
                {a}
              </text>
              <text
                className="present-box-title present-small"
                x={x + 140}
                y={y + 82}
                textAnchor="middle"
              >
                {b}
              </text>
            </g>
          );
        })}
        <text
          className="present-caption present-in"
          x={500}
          y={520}
          textAnchor="middle"
          style={after(3.4)}
        >
          チュートリアルはブラウザ内の簡易サーバー、本番は Go
          のサーバー。物のコードは同じまま
        </text>
      </svg>
    </Slide>
  );
}

const INPUTS = ["conn A", "conn B", "conn C", "ticker", "timers"] as const;

function ServerAndMeasure() {
  return (
    <Slide kicker="見どころ 3" title="サーバー権威と、計測してから直す">
      <svg className="present-svg" viewBox="0 0 1000 560">
        <Defs />
        {INPUTS.map((name, i) => {
          const y = 80 + i * 80;
          return (
            <g key={name}>
              <g className="present-in" style={after(0.3 + i * 0.1)}>
                <rect
                  className="present-box"
                  x={20}
                  y={y - 24}
                  width={120}
                  height={48}
                  rx={10}
                />
                <text
                  className="present-box-sub"
                  x={80}
                  y={y + 6}
                  textAnchor="middle"
                >
                  {name}
                </text>
              </g>
              <Edge
                d={`M140,${y} C200,${y} 200,240 247,240`}
                delay={0.8 + i * 0.08}
              />
              <Packet
                path={`M140,${y} C200,${y} 200,240 250,240`}
                delay={1.6 + i * 0.25}
                dur={1.2}
              />
            </g>
          );
        })}
        <g className="present-in" style={after(1.2)}>
          <rect
            className="present-box"
            x={250}
            y={215}
            width={110}
            height={50}
            rx={10}
          />
          <text className="present-box-sub" x={305} y={246} textAnchor="middle">
            inbox
          </text>
        </g>
        <Edge d="M360,240 L397,240" delay={1.3} />
        <Box
          x={400}
          y={160}
          w={200}
          h={160}
          title="session"
          lines={["goroutine 1 つ", "状態 + 入力", "→ 新しい状態"]}
          delay={1.4}
        />
        <text
          className="present-box-sub present-in"
          x={500}
          y={370}
          textAnchor="middle"
          style={after(2.2)}
        >
          ロック無しで、先着や「締切と完了の
        </text>
        <text
          className="present-box-sub present-in"
          x={500}
          y={398}
          textAnchor="middle"
          style={after(2.2)}
        >
          どちらが先か」が構造で決まる
        </text>
        <g className="present-in" style={after(2.8)}>
          <line
            x1={650}
            y1={40}
            x2={650}
            y2={500}
            stroke="rgb(255 255 255 / 0.25)"
          />
          <text className="present-big" x={825} y={150} textAnchor="middle">
            −86%
          </text>
          <text className="present-box-sub" x={825} y={190} textAnchor="middle">
            1 クライアントの受信量
          </text>
          <text className="present-box-sub" x={825} y={216} textAnchor="middle">
            20Hz の位置を 25 バイトのバイナリに
          </text>
        </g>
        <g className="present-in" style={after(3.4)}>
          <text
            className="present-big present-big-sub"
            x={825}
            y={350}
            textAnchor="middle"
          >
            56.8ms
          </text>
          <text className="present-box-sub" x={825} y={390} textAnchor="middle">
            RTT p50(大阪・9 クライアント)
          </text>
          <text className="present-box-sub" x={825} y={416} textAnchor="middle">
            配信は 20Hz を維持、切断 0
          </text>
        </g>
      </svg>
    </Slide>
  );
}

/** cloudflare.config.ts の抜粋(一部省略) */
const CONFIG_EXCERPT = `import * as backendEntry from "./worker/backend.ts"
  with {type: "cf-worker"};

const backendContainer = defineContainer({
  name: "iubeo-backend-app",
  schedulingPolicy: "durable-object",
  images: {base: {dockerfile: "../backend/Dockerfile"}},
});

const backendWorker = defineWorker({
  name: "iubeo-backend",
  entrypoint: backendEntry,
  exports: {
    Backend: exports.durableObject({
      storage: "sqlite",
      container: backendContainer,
    }),
  },
});`;

function Infra() {
  return (
    <Slide kicker="見どころ 4" title="インフラを TypeScript で書く">
      <div className="present-infra">
        <div className="present-code present-in" style={after(0.4)}>
          <div className="present-code-name">cloudflare.config.ts(抜粋)</div>
          <pre>{CONFIG_EXCERPT}</pre>
        </div>
        <div className="present-infra-side">
          <p className="present-in" style={after(1.0)}>
            新しい CLI <b>cf</b>(ベータ)で、Worker 3 つ・コンテナ 2 つ・Durable
            Object・KV・Workers AI・Rate Limit を 1 ファイルに型付きで
          </p>
          <p className="present-in" style={after(1.6)}>
            入口はパスの文字列ではなく
            import。ファイルを動かせば型検査で気づける
          </p>
          <div className="present-infra-cost present-in" style={after(2.4)}>
            <div>
              <span className="present-cost">$0</span>
              遊ばれていない間
            </div>
            <div>
              <span className="present-cost">$4.57</span>
              EC2 停止中の月額(Discord で起動)
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
}

function Closing() {
  return (
    <div className="present-layer present-closing">
      <img
        className="present-in"
        style={after(0.2)}
        src={logoUrl}
        alt="IUBEO"
      />
      <p className="present-in" style={after(1.0)}>
        AI エージェントの Tool Call を、人間が身体を使って実行する。
      </p>
      <p className="present-in present-closing-sub" style={after(2.0)}>
        ハリボテではなく、本物の技術で。
      </p>
    </div>
  );
}
