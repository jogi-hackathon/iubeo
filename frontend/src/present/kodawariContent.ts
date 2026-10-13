/**
 * 技術パートの「6 つのこだわり」の中身。台本(script.ts)と画面(Kodawari.tsx)の両方で使う。
 * こだわりごとに、箇条書きの 1 項目(と、その下の補足)を 1 手順で 1 つずつ出す
 */

/** 世界観のこだわりで、項目ごとに右側へ実物を描くもの(WorldShowcase.tsx) */
export type WorldScene = "light" | "pc" | "canvas" | "ragdoll" | "directory";

export interface KodawariPoint {
  text: string;
  sub?: readonly string[];
  /** この項目を出している間、右側に描く実物(世界観の項目はゲームの流れの順に並べる) */
  scene?: WorldScene;
}

export interface KodawariContent {
  key: string;
  /** 一覧で立方体の下に出す名前 */
  label: string;
  title: string;
  /** 立方体の縁の色。ゲームのファイルと同じ 6 色(backend/internal/session/layout.go の directoryStock) */
  color: string;
  /** 最初の項目を出す手順で話す台詞(以降の手順は項目そのもの) */
  line: string;
  points: readonly KodawariPoint[];
}

export const KODAWARI_CONTENT: readonly KodawariContent[] = [
  {
    key: "browser",
    line: "ゲーム内の PC のブラウザは、iframe でもモックでもなく Firefox のエンジンそのものです。firefox-wasm をフォークして JIT と日本語の表示を改善しました",
    label: "ブラウザ",
    title: "ブラウザへのこだわり",
    color: "#1d6fe0",
    points: [
      {
        text: "本物の Firefox のエンジンを Wasm で動かした",
        sub: ["iframe でも画面のモックでもない"],
      },
      {
        text: "firefox-wasm をフォークして JIT と日本語表示を改善した",
        sub: ["github.com/thirdlf03/firefox-wasm"],
      },
      {text: "Wisp で TCP/UDP を WebSocket の上に通した"},
      {
        text: "検索画面を Brave Search API で自作した",
        sub: ["Google 検索だと Bot と判定されるため"],
      },
      {text: "お題に合っているかは Workers AI の Clef で判定した"},
    ],
  },
  {
    key: "cf",
    line: "インフラは wrangler ではなく、ベータ版の新しい CLI cf を使い、TypeScript 1 ファイルに書きました",
    label: "cf",
    title: "cf へのこだわり",
    color: "#f4a261",
    points: [
      {text: "wrangler ではなくベータ版の新しい CLI cf を使った"},
      {
        text: "インフラを cloudflare.config.ts 1 ファイルに型付きで書いた",
        sub: [
          "Worker 3・コンテナ 2・Durable Object・KV・Workers AI・Rate Limit",
        ],
      },
      {
        text: "Worker の入口を import で参照した",
        sub: ["ファイルを動かすと型検査で気づける"],
      },
      {
        text: "ドキュメントに無い挙動に実機で当たりながら進めた",
        sub: [
          "既定の設定ではコンテナに署名鍵を渡せず Go サーバーが起動しなかった",
        ],
      },
    ],
  },
  {
    key: "perf",
    line: "計測の仕組みを先に作り、20Hz の位置を 25 バイトのバイナリにして受信量を 86% 減らしました",
    label: "パフォーマンス",
    title: "パフォーマンスへのこだわり",
    color: "#2a9d5c",
    points: [
      {text: "計測の仕組みを作り、道具の誤りから先に直した"},
      {
        text: "20Hz の位置だけを 25 バイトのバイナリにした",
        sub: ["1 クライアントの受信ペイロード 11,945 → 1,700 B/秒(−86%)"],
      },
      {
        text: "33 MB の wasm を起動の裏で取っておいた",
        sub: ["4G で PC のブラウザが使えるまで 93.7 秒 → 1.3 秒"],
      },
      {
        text: "大阪のコンテナに 9 クライアントでつないで実測した",
        sub: ["RTT p50 56.8ms・20Hz を維持・切断 0"],
      },
    ],
  },
  {
    key: "voice",
    line: "ボイスチャットは MoQ で Opus を送り、ゲームの座標で相手ごとに距離で聞こえ方を変えました",
    label: "立体音響",
    title: "立体音響へのこだわり",
    color: "#9b5de5",
    points: [
      {text: "MoQ / WebTransport の datagram で Opus を送った"},
      {text: "ゲームサーバーの座標で相手ごとに距離減衰をかけた"},
      {text: "セッションに紐づいた JWT で別のゲームに声が漏れないようにした"},
      {text: "VC サービスと MoQ リレーはチームメンバーが別ホストで動かした"},
    ],
  },
  {
    key: "three",
    line: "Babylon.js ではなく Three.js を選び、ゲームエンジンが受け持つ部分を自分たちで作りました",
    label: "Three.js",
    title: "Three.js へのこだわり",
    color: "#ffd60a",
    points: [
      {
        text: "Babylon.js ではなく Three.js + React Three Fiber を選んだ",
        sub: [
          "Babylon.js は機能が多すぎてバンドルも大きく、AI で書くと品質が落ちた",
        ],
      },
      {
        text: "ゲームエンジンが受け持つ部分を自分たちで作った",
        sub: [
          "当たり判定と一人称の移動・シーン遷移・TSL のポストプロセス・シェーダーのウォームアップ・AO の GPU ベイク",
        ],
      },
      {
        text: "状態の送り元を差し替えられるようにした",
        sub: ["チュートリアルはブラウザ内の簡易サーバー、本番は Go のサーバー"],
      },
    ],
  },
  {
    key: "world",
    line: "真っ白な世界観を伝えるため、勝敗に関係しない部分まで作り込みました",
    label: "世界観",
    title: "世界観へのこだわり",
    color: "#e63946",
    points: [
      {
        text: "WebGPU 専用にし、影を使わず半球光と AO だけで陰影を付けた",
        scene: "light",
      },
      {
        text: "部屋の PC で Windows 2000 風のデスクトップを動かした",
        scene: "pc",
      },
      {text: "画像生成はノイズから絵が現れるようにした", scene: "canvas"},
      {
        text: "脱落すると体がラグドールになって燃えて欠けていくようにした",
        scene: "ragdoll",
      },
      {
        text: "ライターで火をつけるとディレクトリが侵食されて消えるようにした",
        scene: "directory",
      },
    ],
  },
];

/** こだわりの手順の id。count は出している項目の数(1 から) */
export const kodawariStepId = (key: string, count: number): string =>
  `k-${key}/${count}`;

/** 技術パートの手順のうち、こだわりの各項目を出す手順 */
export const KODAWARI_STEPS = KODAWARI_CONTENT.flatMap((k) =>
  k.points.map((p, i) => ({
    id: kodawariStepId(k.key, i + 1),
    line: i === 0 ? k.line : p.text,
  })),
);
