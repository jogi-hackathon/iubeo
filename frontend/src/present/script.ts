import {KODAWARI_STEPS} from "./kodawariContent";

/**
 * プレゼンの台本。冒頭のイントロと、デモのあとの技術パートの 2 つのデッキがある。
 * イントロは喋らずに流す。暗転で待ち、次へを押すと起き上がってチュートリアルに入るまで自動で進む。
 * 技術パートは手順をプレゼンターのキー操作で 1 つずつ進める。
 * line は技術パートではプレゼンターが話す台詞(の案)、イントロでは流れる中身のメモで、画面には出さない(dev パネルの台本表示に使う)
 */
export const DECKS = {
  intro: [
    {id: "dark", line: "(暗転して待つ。次へで再生を始める)"},
    {
      id: "ask",
      line: "(「JOGI HACKについて調べて」と打ち込み、AI が調べて答える)",
    },
    {
      id: "prompts",
      line: "(画像生成・ファイルの読み書き・Web検索などを次々に頼み、AI が従順に答える)",
    },
    {id: "stall", line: "(人間が黙り、AI の方から頼みごとが届く)"},
    {id: "swap", line: "(立場が入れかわり、AI からの命令があふれて暗転)"},
    {id: "logo", line: "(ロゴを出す)"},
    {
      id: "turn",
      line: "(ロゴが消えて暗転 → 一瞬でゲームへ。倒れた状態から起き上がり、チュートリアルへ)",
    },
  ],
  tech: [
    {
      id: "close",
      line: "(目を閉じる)ここからは、この世界の裏側を紹介します",
    },
    {
      id: "arch",
      line: "全体の構成です。プレイヤーのブラウザから Cloudflare と AWS につながっています",
    },
    {
      id: "arch-play",
      line: "ゲームの通信は /api から iubeo-backend を通り、EC2 の Go サーバーへ WebSocket でつながります",
    },
    {
      id: "arch-browser",
      line: "PC のブラウザの通信は /wisp から WISP を通って外のサイトへ出ます。検索結果は Brave Search API から取ります",
    },
    {
      id: "arch-judge",
      line: "開いたページがお題に合っているかは、フロントの Worker が Workers AI で判定します",
    },
    {
      id: "arch-vc",
      line: "ボイスチャットは別ホストの MoQ リレーに直接つなぎ、ゲームの中の距離で聞こえ方が変わります",
    },
    {
      id: "arch-ops",
      line: "EC2 は Discord のコマンドで必要なときだけ起動し、3 時間たつと自動で止まります。KV の target で向き先を切り替えます。それ以外のときは Cloudflare Containers に流れます",
    },
    {
      id: "kodawari",
      line: "ここからは、6 つのこだわりを紹介します",
    },
    ...KODAWARI_STEPS,
    {
      id: "closing",
      line: "AI エージェントの Tool Call を人間が身体を使って実行する。それをハリボテではなく本物の技術で作りました",
    },
    {
      id: "wake",
      line: "(目を開ける → 部屋へ。窓の外を見続けるとクレジットが流れる)",
    },
  ],
} as const;

export type DeckId = keyof typeof DECKS;

export const DECK_IDS = Object.keys(DECKS) as DeckId[];

export type StepId<D extends DeckId> = (typeof DECKS)[D][number]["id"];

export const stepIndexOf = <D extends DeckId>(deck: D, id: StepId<D>): number =>
  DECKS[deck].findIndex((s) => s.id === id);

export const lastStepOf = (deck: DeckId): number => DECKS[deck].length - 1;

export const stepIdOf = (deck: DeckId, step: number): string =>
  DECKS[deck][step]?.id ?? "";
