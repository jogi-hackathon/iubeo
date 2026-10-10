import {
  clip,
  MAX_PAGE_TEXT,
  MAX_PAGE_TITLE,
  MAX_PAGE_URL,
  MAX_TASK,
} from "./request";
import type {JudgeRequest, JudgeResult, JudgeVerdict} from "./types";

export {clip, MAX_PAGE_TEXT, MAX_PAGE_TITLE};

/** Workers AI のモデル ID (env.AI.run の第 1 引数)。latency 重視なので 9B の flash を使う */
export const CLEF_MODEL_ID = "@cf/cloudflare/clef-flash";
/** リクエスト本体の model フィールド (System One API のセレクタ) */
export const CLEF_MODEL = "clef-flash";
/** Clef の呼び出しの上限 (ms)。速いモデルなので短くてよい */
export const CLEF_TIMEOUT_MS = 5000;

/** お題への一致度を聞く Score の目盛り (順序つき)。確率加重された値が返る */
export const RELEVANCE_LEVELS = [
  "Unrelated: the page is about a different subject",
  "Tangential: it only mentions the task term in passing",
  "On topic: the page is about the task term",
  "Authoritative: it is an official or reference page for the task term",
] as const;

/** 最後に選ばせる 1 つ。画面の「一致 / 一部一致 / 不一致」に対応する */
export const VERDICT_OPTIONS = {
  match: "The page fits the task: it is about the task term",
  partial:
    "The page is related to the task term but is not really about it (a mention, a homonym, or an unrelated result on the same page)",
  mismatch:
    "The page has nothing to do with the task term: the player searched for something else",
} as const;

/**
 * Clef に渡す state。お題と、今見ているページを 1 つの文章にまとめる。
 * Worker は受けた時点で normalizeJudgeRequest を掛けているが、ここでも全項目を切り詰める (入力の量を必ず抑える)
 */
export const buildClefState = ({task, page}: JudgeRequest): string =>
  [
    `The player's task is to search the web for: "${clip(task, MAX_TASK)}".`,
    "They are using a browser inside a game. Below is the page they are looking at right now.",
    "",
    `URL: ${clip(page.url, MAX_PAGE_URL)}`,
    `Title: ${clip(page.title, MAX_PAGE_TITLE)}`,
    `Text: ${clip(page.text, MAX_PAGE_TEXT)}`,
  ].join("\n");

/** Clef に渡す質問。お題そのものを instructions に埋め込む (state が長くても文脈を失わない) */
export const buildClefQuestions = (task: string) => ({
  query_on_topic: {
    type: "noul" as const,
    instructions: `The player arrived at this page by searching for something that means "${task}" (the URL, the query, or the page's subject says so).`,
    criteria: {
      true: `The search was about "${task}"`,
      false: `The search was about something else, or there is no sign of a search`,
    },
  },
  page_on_topic: {
    type: "noul" as const,
    instructions: `The page's own content is about "${task}" rather than a different subject.`,
    criteria: {
      true: `The page is about "${task}"`,
      false: `The page is mainly about something else`,
    },
  },
  relevance: {
    type: "score" as const,
    instructions: `How well does this page serve a player whose task is "${task}"?`,
    criteria: [...RELEVANCE_LEVELS],
  },
  verdict: {
    type: "choice" as const,
    instructions: `Does this page count as a search result that fits the task "${task}"?`,
    criteria: {...VERDICT_OPTIONS},
  },
});

/** Clef (System One API) に渡す本体。env.AI.run の inputs としてそのまま渡せる */
export const clefRequest = (input: JudgeRequest) => ({
  state: buildClefState(input),
  model: CLEF_MODEL,
  questions: buildClefQuestions(clip(input.task, MAX_TASK)),
});

/**
 * env.AI (Workers AI の binding) のうち、Clef を呼ぶのに必要な部分だけ。
 * @cloudflare/workers-types に依存しない (このファイルはブラウザ側の tsconfig でも読めるように)
 */
export type ClefBinding = {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: {signal?: AbortSignal},
  ): Promise<Record<string, unknown>>;
};

/**
 * Clef を呼べなかった理由。呼ぶ側 (Worker) が HTTP の状態に変換する。
 * - unconfigured: AI binding が無い (503。画面は簡易判定に落ちる)
 * - それ以外: 呼び出しはしたが、使える答えが返らなかった (502)
 */
export type ClefFailure = "unconfigured" | "unreachable" | "unusable";

export class ClefError extends Error {
  readonly failure: ClefFailure;

  constructor(failure: ClefFailure, message: string) {
    super(message);
    this.name = "ClefError";
    this.failure = failure;
  }
}

/**
 * Clef を呼んで、画面に出す形へ畳む。binding が無ければ ClefError("unconfigured")。
 * ブラウザからは呼ばない。フロントの Worker (worker/judge.ts) だけが使う
 */
export const askClef = async (
  ai: ClefBinding | undefined,
  input: JudgeRequest,
): Promise<JudgeResult> => {
  if (!ai) {
    throw new ClefError("unconfigured", "judge is not configured");
  }
  let body: Record<string, unknown>;
  try {
    body = await ai.run(CLEF_MODEL_ID, clefRequest(input), {
      signal: AbortSignal.timeout(CLEF_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : "unknown";
    throw new ClefError("unreachable", `clef request failed: ${detail}`);
  }
  const result = answersToResult(body.answers);
  if (!result) {
    throw new ClefError("unusable", "clef returned an unusable answer");
  }
  return result;
};

/**
 * Clef の答え (`answers`) を、画面に出す形へ畳む。形が違えば null
 * (Clef は型を守るので、壊れているとしたら相手が Clef でないとき)。
 */
export const answersToResult = (answers: unknown): JudgeResult | null => {
  if (!answers || typeof answers !== "object") {
    return null;
  }
  const map = answers as Record<string, unknown>;

  const verdictAnswer = asRecord(map.verdict);
  const choice = verdictAnswer?.choice;
  if (!isVerdict(choice)) {
    return null;
  }

  const confidence = clamp01(verdictAnswer?.confidence);
  const score = scoreOf(map.relevance) ?? scoreOfVerdict(choice);

  return {
    verdict: choice,
    score,
    confidence,
    reasons: reasonsOf(map, choice),
    source: "clef",
  };
};

const reasonsOf = (answers: Record<string, unknown>, choice: JudgeVerdict) => {
  const query = noulOf(answers.query_on_topic);
  const page = noulOf(answers.page_on_topic);
  const reasons: string[] = [];
  if (query !== null) {
    reasons.push(
      query >= 0.5
        ? "検索がお題の語を指しています"
        : "検索がお題と違う語を指しているようです",
    );
  }
  if (page !== null) {
    reasons.push(
      page >= 0.5
        ? "ページの内容がお題についてです"
        : "ページの内容がお題と別の話題です",
    );
  }
  if (reasons.length === 0) {
    reasons.push(REASON_BY_VERDICT[choice]);
  }
  return reasons;
};

const REASON_BY_VERDICT: Record<JudgeVerdict, string> = {
  match: "お題に合ったページを開いています",
  partial: "お題と関係はありますが、ぴったりではありません",
  mismatch: "お題とは別のものを検索しています",
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const isVerdict = (value: unknown): value is JudgeVerdict =>
  value === "match" || value === "partial" || value === "mismatch";

const noulOf = (value: unknown): number | null => {
  const record = asRecord(value);
  const noul = record?.noul;
  return typeof noul === "number" && Number.isFinite(noul)
    ? clamp01(noul)
    : null;
};

const scoreOf = (value: unknown): number | null => {
  const score = asRecord(value)?.score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return null;
  }
  const ratio = score / (RELEVANCE_LEVELS.length - 1);
  return clamp01(Math.round(ratio * 1000) / 1000);
};

const scoreOfVerdict = (verdict: JudgeVerdict): number =>
  verdict === "match" ? 1 : verdict === "partial" ? 0.5 : 0;

const clamp01 = (value: unknown): number => {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, number));
};
