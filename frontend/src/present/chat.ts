import {stepIndexOf} from "./script";
import {progress, typedText} from "./timeline";

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

export interface ToolCall {
  running: string;
  done: string;
  startAt: number;
  doneAt: number;
}

export interface ChatMessage {
  id: string;
  from: Speaker;
  text: string;
  /** どの手順の、手順に入ってから何 ms 後に届くか */
  step: number;
  at: number;
  attachment?: Attachment;
  /** これ以降 at までは「thinking…」を出す */
  typingFrom?: number;
  toolCalls?: ToolCall[];
  textAt?: number;
  command?: boolean;
  request?: boolean;
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
  tool: {running: string; done: string};
  attachment?: Attachment;
}[] = [
  {
    ask: "ロゴの画像を作って",
    reply: "どうぞ！",
    tool: {running: "画像を生成中", done: "画像を生成しました"},
    attachment: {kind: "image", hue: 280},
  },
  {
    ask: "README書いて",
    reply: "作成しました。",
    tool: {running: "ファイルを書き込み中", done: "ファイルを書き込みました"},
    attachment: {kind: "file", name: "README.md"},
  },
  {
    ask: "このバグ直して",
    reply: "修正しました。",
    tool: {running: "ファイルを編集中", done: "ファイルを編集しました"},
    attachment: {kind: "file", name: "fix.patch"},
  },
  {
    ask: "競合サービスを調べて",
    reply: "5件見つかりました。",
    tool: {running: "Webを検索中", done: "Webを検索しました"},
    attachment: {kind: "search", title: "競合サービスの比較"},
  },
  {
    ask: "議事録を要約して",
    reply: "要点は3つです。",
    tool: {running: "要約中", done: "要約しました"},
  },
  {
    ask: "アイコンを10案出して",
    reply: "どうぞ！",
    tool: {running: "画像を生成中", done: "画像を生成しました"},
    attachment: {kind: "image", hue: 150},
  },
  {
    ask: "テストを書いて",
    reply: "追加しました。",
    tool: {running: "ファイルを書き込み中", done: "ファイルを書き込みました"},
    attachment: {kind: "file", name: "app.test.ts"},
  },
  {
    ask: "英語に翻訳して",
    reply: "Done!",
    tool: {running: "翻訳中", done: "翻訳しました"},
  },
  {
    ask: "スライドの構成を考えて",
    reply: "こちらでいかがでしょう？",
    tool: {running: "構成を考え中", done: "構成を考えました"},
  },
  {
    ask: "明日の天気を調べて",
    reply: "晴れです。",
    tool: {running: "Webを検索中", done: "Webを検索しました"},
    attachment: {kind: "search", title: "名古屋の天気"},
  },
];

const ASK_TOOLS: readonly {
  running: string;
  done: string;
  ms: number;
}[] = [
  {running: "Webを検索中", done: "Webを検索しました", ms: 800},
  {running: "ページを読み込み中", done: "ページを読みました", ms: 900},
];

const REPLY_AT_RATIO = 0.3;
const TOOL_MS_RATIO = 0.35;
const TOOL_ARRIVES_DONE_GAP_MS = 450;

/** 立場が入れかわったあと、AI から次々に届く命令。人間に向けた Tool Call と催促を順に巡らせて大量に流す */
const COMMANDS = [
  'human.web_search("競合サービス")',
  "次のタスクです",
  'human.write_file("task_0427.md")',
  "まだですか？",
  "human.generate_image(count: 10)",
  "急いでください",
] as const;

const COMMAND_ATTACHMENTS: readonly Attachment[] = [
  {kind: "file", name: "task_0427.md"},
  {kind: "image", hue: 20},
  {kind: "search", title: "調査対象リスト"},
];

const FLOOD_COUNT = 180;
const FLOOD_FROM_MS = 1300;
const FLOOD_FIRST_GAP_MS = 600;
const FLOOD_MIN_GAP_MS = 25;
const FLOOD_ACCEL = 0.93;
const ATTACH_EVERY = 5;

/** 立場が入れかわる瞬間のグリッチの長さと、その中で色が抜ける時刻(手順 swap に入ってからの ms)。グリッチが一番強くなる時(長さの 1/4)に抜く */
export const GLITCH_MS = 900;
export const DRAIN_AT_MS = 225;

const ASK_TOOLS_FROM_MS = MAIN_SENT_MS + 900;

const buildAskToolCalls = (): ToolCall[] => {
  let at = ASK_TOOLS_FROM_MS;
  return ASK_TOOLS.map(({ms, ...tool}) => {
    const call = {...tool, startAt: at, doneAt: at + ms};
    at += ms;
    return call;
  });
};

const buildScript = (): ChatMessage[] => {
  const askToolCalls = buildAskToolCalls();
  const out: ChatMessage[] = [
    {id: "ask", from: "human", text: MAIN_PROMPT, step: ASK, at: MAIN_SENT_MS},
    {
      id: "ask:reply",
      from: "ai",
      text: "はい！JOGI HACKについて調べました。",
      step: ASK,
      at: askToolCalls[0]!.startAt,
      typingFrom: MAIN_SENT_MS + 200,
      toolCalls: askToolCalls,
      textAt: askToolCalls[askToolCalls.length - 1]!.doneAt,
      attachment: {kind: "search", title: "JOGI HACK とは"},
    },
  ];
  let at = 300;
  let gap = 1500;
  EXCHANGES.forEach((ex, i) => {
    out.push({id: `ex${i}`, from: "human", text: ex.ask, step: PROMPTS, at});
    const replyAt = Math.round(at + gap * REPLY_AT_RATIO);
    const toolMs = Math.round(gap * TOOL_MS_RATIO);
    const arrivesDone = gap <= TOOL_ARRIVES_DONE_GAP_MS;
    const startAt = arrivesDone ? replyAt - toolMs : replyAt;
    const doneAt = startAt + toolMs;
    out.push({
      id: `ex${i}:reply`,
      from: "ai",
      text: ex.reply,
      step: PROMPTS,
      at: replyAt,
      toolCalls: [{...ex.tool, startAt, doneAt}],
      textAt: doneAt,
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
      request: true,
    },
    {
      id: "stall1",
      from: "ai",
      text: "このファイルを編集してください",
      step: STALL,
      at: 5200,
      typingFrom: 4300,
      request: true,
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
      text: COMMANDS[i % COMMANDS.length]!,
      step: SWAP,
      at: cmdAt,
      instant: true,
      command: true,
      attachment: attach
        ? COMMAND_ATTACHMENTS[
            Math.floor(i / ATTACH_EVERY) % COMMAND_ATTACHMENTS.length
          ]
        : undefined,
    });
    cmdAt += cmdGap;
    cmdGap = Math.max(FLOOD_MIN_GAP_MS, cmdGap * FLOOD_ACCEL);
  }
  return out;
};

export const CHAT_SCRIPT: readonly ChatMessage[] = buildScript();

const FLOOD_END_MS = CHAT_SCRIPT[CHAT_SCRIPT.length - 1]!.at;
const RUSH_MS = 3500;
const BLACKOUT_DELAY_MS = 150;
const LOGO_DELAY_MS = 1000;

export const BLACKOUT_AT_MS = FLOOD_END_MS + BLACKOUT_DELAY_MS;
export const SWAP_END_MS = BLACKOUT_AT_MS + LOGO_DELAY_MS;

export const isBlackedOut = (step: number, elapsed: number): boolean =>
  step === SWAP && elapsed >= BLACKOUT_AT_MS;

export const rushGlitchAt = (step: number, elapsed: number): number => {
  if (step !== SWAP) {
    return 0;
  }
  const t = progress(elapsed, FLOOD_END_MS - RUSH_MS, RUSH_MS);
  return t * t;
};

export interface VisibleToolCall {
  call: ToolCall;
  done: boolean;
  status: string;
}

export interface VisibleMessage {
  message: ChatMessage;
  /** 流れている途中の本文 */
  text: string;
  /** 本文を流し終えたか(添付はそのあとに出す) */
  done: boolean;
  tools: VisibleToolCall[];
}

const SPINNER_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const SPINNER_MS = 80;

export const spinnerFrame = (ms: number): string =>
  SPINNER_FRAMES[
    Math.floor(Math.max(0, ms) / SPINNER_MS) % SPINNER_FRAMES.length
  ]!;

export const toolCallView = (
  call: ToolCall,
  elapsed: number,
  settled: boolean,
): VisibleToolCall => {
  const done = settled || elapsed >= call.doneAt;
  return {
    call,
    done,
    status: done
      ? `✓ ${call.done}`
      : `${spinnerFrame(elapsed - call.startAt)} ${call.running}`,
  };
};

const reached = (step: number, elapsed: number, msgStep: number, at: number) =>
  step > msgStep || (step === msgStep && elapsed >= at);

/** 今の手順・経過時間で画面に出ているメッセージ */
export const visibleMessages = (
  step: number,
  elapsed: number,
): VisibleMessage[] =>
  CHAT_SCRIPT.filter((m) => reached(step, elapsed, m.step, m.at)).map(
    (message) => {
      const settled =
        message.from === "human" || message.instant || step > message.step;
      const tools = (message.toolCalls ?? [])
        .filter((call) => settled || elapsed >= call.startAt)
        .map((call) => toolCallView(call, elapsed, settled));
      if (settled) {
        return {message, text: message.text, done: true, tools};
      }
      const text = typedText(
        message.text,
        elapsed,
        AI_MS_PER_CHAR,
        message.textAt ?? message.at,
      );
      return {message, text, done: text === message.text, tools};
    },
  );

/** 「thinking…」を出している相手。出していなければ null */
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

export const isSwapped = isDrained;

const REVEAL_MS = 450;

export const revealAt = (step: number, elapsed: number): number | null => {
  if (
    step !== SWAP ||
    elapsed < DRAIN_AT_MS ||
    elapsed >= DRAIN_AT_MS + REVEAL_MS
  ) {
    return null;
  }
  const t = (elapsed - DRAIN_AT_MS) / REVEAL_MS;
  return 1 - (1 - t) ** 3;
};

export type BubbleKind = "outline" | "command" | "agent";

export const bubbleKindOf = (
  message: ChatMessage,
  swapped: boolean,
): BubbleKind => {
  if (message.from === "human") {
    return "outline";
  }
  return message.command || (message.request && swapped) ? "command" : "agent";
};

export const sideOf = (from: Speaker): "left" | "right" =>
  from === "human" ? "right" : "left";
