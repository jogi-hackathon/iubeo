import {stepIndexOf} from "./script";
import {typedText} from "./timeline";

const ASK = stepIndexOf("intro", "ask");
const PROMPTS = stepIndexOf("intro", "prompts");
const STALL = stepIndexOf("intro", "stall");
const SWAP = stepIndexOf("intro", "swap");

/** AI の返事に付く物。色のある物を混ぜておき、立場が入れかわるときに色を抜く */
export type Attachment =
  | {kind: "search"; title: string}
  | {kind: "image"; hue: number}
  | {kind: "file"; name: string};

export type Speaker = "human" | "ai";

export interface ChatMessage {
  id: string;
  from: Speaker;
  text: string;
  /** どの手順の、手順に入ってから何 ms 後に届くか */
  step: number;
  at: number;
  attachment?: Attachment;
  /** これ以降 at までは「入力中…」を出す */
  typingFrom?: number;
  /** 本文を流さず、届いた瞬間に全部出す(大量に届く命令) */
  instant?: boolean;
}

/** 最初に打ち込むプロンプト */
export const MAIN_PROMPT = "JOGI HACKについて調べて";
const MAIN_TYPE_FROM_MS = 400;
const MAIN_MS_PER_CHAR = 80;
const MAIN_SENT_MS = 2300;

/** AI の返事が流れる速さ */
const AI_MS_PER_CHAR = 28;

/** 手順 prompts のやり取り。後ろほど間隔が詰まり、AI は従順に答え続ける */
const EXCHANGES: readonly {
  ask: string;
  reply: string;
  attachment?: Attachment;
}[] = [
  {
    ask: "ロゴの画像を作って",
    reply: "どうぞ！",
    attachment: {kind: "image", hue: 280},
  },
  {
    ask: "README書いて",
    reply: "作成しました。",
    attachment: {kind: "file", name: "README.md"},
  },
  {
    ask: "このバグ直して",
    reply: "修正しました。",
    attachment: {kind: "file", name: "fix.patch"},
  },
  {
    ask: "競合サービスを調べて",
    reply: "5件見つかりました。",
    attachment: {kind: "search", title: "競合サービスの比較"},
  },
  {ask: "議事録を要約して", reply: "要点は3つです。"},
  {
    ask: "アイコンを10案出して",
    reply: "どうぞ！",
    attachment: {kind: "image", hue: 150},
  },
  {
    ask: "テストを書いて",
    reply: "追加しました。",
    attachment: {kind: "file", name: "app.test.ts"},
  },
  {ask: "英語に翻訳して", reply: "Done!"},
  {ask: "スライドの構成を考えて", reply: "こちらでいかがでしょう？"},
  {
    ask: "明日の天気を調べて",
    reply: "晴れです。",
    attachment: {kind: "search", title: "名古屋の天気"},
  },
];

/** 立場が入れかわったあと、AI から次々に届く命令(順に巡らせて大量に流す) */
const COMMANDS = [
  "Web検索をしてください",
  "ファイルを保存してください",
  "画像を生成してください",
  "このファイルを読んでください",
  "次のタスクです",
  "急いでください",
  "ファイルを編集してください",
  "まだですか？",
  "タスクを完了してください",
  "もう一度やり直してください",
  "これも調べてください",
  "次のタスクです",
  "画像をもう10枚生成してください",
  "このファイルを書き直してください",
  "今すぐ対応してください",
  "次のタスクです",
] as const;

/** 命令に付ける添付(何通かに 1 通) */
const COMMAND_ATTACHMENTS: readonly Attachment[] = [
  {kind: "file", name: "task_0427.md"},
  {kind: "image", hue: 20},
  {kind: "file", name: "data.csv"},
  {kind: "search", title: "調査対象リスト"},
  {kind: "file", name: "draft_v12.docx"},
  {kind: "image", hue: 200},
];

const FLOOD_COUNT = 120;
const FLOOD_FROM_MS = 1300;
const FLOOD_FIRST_GAP_MS = 650;
const FLOOD_MIN_GAP_MS = 40;
const ATTACH_EVERY = 5;

/** 立場が入れかわる瞬間のグリッチの長さと、その中で色が抜ける時刻(手順 swap に入ってからの ms)。グリッチが一番強くなる時(長さの 1/4)に抜く */
export const GLITCH_MS = 900;
export const DRAIN_AT_MS = 225;

const buildScript = (): ChatMessage[] => {
  const out: ChatMessage[] = [
    {id: "ask", from: "human", text: MAIN_PROMPT, step: ASK, at: MAIN_SENT_MS},
    {
      id: "ask:reply",
      from: "ai",
      text: "はい！JOGI HACKについて調べました。",
      step: ASK,
      at: MAIN_SENT_MS + 900,
      typingFrom: MAIN_SENT_MS + 200,
      attachment: {kind: "search", title: "JOGI HACK とは"},
    },
  ];
  let at = 300;
  let gap = 1500;
  EXCHANGES.forEach((ex, i) => {
    out.push({id: `ex${i}`, from: "human", text: ex.ask, step: PROMPTS, at});
    out.push({
      id: `ex${i}:reply`,
      from: "ai",
      text: ex.reply,
      step: PROMPTS,
      at: at + gap * 0.45,
      attachment: ex.attachment,
    });
    at += gap;
    gap = Math.max(380, gap * 0.78);
  });
  out.push(
    {
      id: "stall0",
      from: "ai",
      text: "画像を生成してください",
      step: STALL,
      at: 2600,
      typingFrom: 1400,
    },
    {
      id: "stall1",
      from: "ai",
      text: "このファイルを編集してください",
      step: STALL,
      at: 5200,
      typingFrom: 4300,
      attachment: {kind: "file", name: "企画書.docx"},
    },
  );
  let cmdAt = FLOOD_FROM_MS;
  let cmdGap = FLOOD_FIRST_GAP_MS;
  for (let i = 0; i < FLOOD_COUNT; i++) {
    const attach = i % ATTACH_EVERY === ATTACH_EVERY - 1;
    out.push({
      id: `cmd${i}`,
      from: "ai",
      text: COMMANDS[(i * 7) % COMMANDS.length]!,
      step: SWAP,
      at: cmdAt,
      instant: true,
      attachment: attach
        ? COMMAND_ATTACHMENTS[
            Math.floor(i / ATTACH_EVERY) % COMMAND_ATTACHMENTS.length
          ]
        : undefined,
    });
    cmdAt += cmdGap;
    cmdGap = Math.max(FLOOD_MIN_GAP_MS, cmdGap * 0.85);
  }
  return out;
};

export const CHAT_SCRIPT: readonly ChatMessage[] = buildScript();

export interface VisibleMessage {
  message: ChatMessage;
  /** 流れている途中の本文 */
  text: string;
  /** 本文を流し終えたか(添付はそのあとに出す) */
  done: boolean;
}

const reached = (step: number, elapsed: number, msgStep: number, at: number) =>
  step > msgStep || (step === msgStep && elapsed >= at);

/** 今の手順・経過時間で画面に出ているメッセージ */
export const visibleMessages = (
  step: number,
  elapsed: number,
): VisibleMessage[] =>
  CHAT_SCRIPT.filter((m) => reached(step, elapsed, m.step, m.at)).map(
    (message) => {
      if (message.from === "human" || message.instant || step > message.step) {
        return {message, text: message.text, done: true};
      }
      const text = typedText(message.text, elapsed, AI_MS_PER_CHAR, message.at);
      return {message, text, done: text === message.text};
    },
  );

/** 「入力中…」を出している相手。出していなければ null */
export const typingSpeaker = (
  step: number,
  elapsed: number,
): Speaker | null => {
  const typing = CHAT_SCRIPT.find(
    (m) =>
      m.typingFrom !== undefined &&
      m.step === step &&
      elapsed >= m.typingFrom &&
      elapsed < m.at,
  );
  return typing?.from ?? null;
};

/** 入力欄の中身。打ち込み中の文字か、空なら薄く出す案内 */
export const inputAt = (
  step: number,
  elapsed: number,
): {text: string; placeholder: string} => {
  if (step === ASK && elapsed < MAIN_SENT_MS) {
    return {
      text: typedText(
        MAIN_PROMPT,
        elapsed,
        MAIN_MS_PER_CHAR,
        MAIN_TYPE_FROM_MS,
      ),
      placeholder: "",
    };
  }
  return {
    text: "",
    placeholder: step >= SWAP ? "命令を待っています" : "メッセージを入力",
  };
};

/** 画面から色が抜けたか。手順 swap に入ってすぐ、グリッチが一番強い瞬間に抜ける */
export const isDrained = (step: number, elapsed: number): boolean =>
  step > SWAP || (step === SWAP && elapsed >= DRAIN_AT_MS);
