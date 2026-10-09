import {useSyncExternalStore} from "react";

import {normalizeJudgeRequest} from "../../judge/request";
import type {
  JudgeRequest,
  JudgeResult,
  JudgeVerdict,
  PageSnapshot,
} from "../../judge/types";

/**
 * Web Search のお題に、今の検索がふさわしいかを判定する。
 *
 * 本物の判定は Cloudflare の Clef (System One モデル) が行う。ブラウザから Workers AI の
 * binding を触らせないため、フロントの Worker (`worker/judge.ts`) の `/judge` を叩く。
 * 届かないときは、通信を待たせずその場で簡易判定 (語の重なり) に落とす。
 * どちらで判定したかは結果に持たせ、画面にも出す。
 *
 * **トリガーは無い**。プレイヤーが判定を要求するのではなく、ページが変わるたびに彼らが勝手に見る
 * (判定される側が判定を要求するのは、AI が上・人間が道具という世界観と逆になる)。
 * 画面に出すのは**外れたときの介入**が主で、合っているときは短い一言だけにする。
 */

export type {JudgeRequest, JudgeResult, JudgeVerdict, PageSnapshot};

/** 判定のエンドポイント。本番は Worker、開発は Vite のミドルウェアが受ける */
export const JUDGE_ENDPOINT = import.meta.env.VITE_JUDGE_URL ?? "/judge";
/** 判定の往復の上限 (ms)。Clef は速いので、これを過ぎたら簡易判定に落とす */
export const JUDGE_TIMEOUT_MS = 8000;
/** 一致とみなす下限、一部一致とみなす下限 (簡易判定) */
const MATCH_AT = 0.6;
const PARTIAL_AT = 0.25;
/** 画面に出す長さ (ms)。介入は長く、合図は短く */
const INTERVENE_MS = 9000;
/** 「お題に合っている」の合図の長さ。合った判定は、この合図を見せてから PC を閉じる */
export const CONFIRM_MS = 3000;
const ERROR_MS = 6000;

/** 判定の進行。画面はこれを見て、通知を出す */
export type JudgeState =
  | {status: "idle"}
  | {status: "running"; task: string; url: string}
  | {status: "done"; task: string; url: string; result: JudgeResult}
  | {status: "error"; task: string; url: string; message: string};

/** 画面に出す 1 回ぶんの知らせ。tear は画面を一瞬乱すか (彼らの介入) */
export type JudgeAnnouncement = {
  lines: string[];
  /** true なら、CRT を一瞬乱してから出す */
  tear: boolean;
  /** 出しておく長さ (ms) */
  ms: number;
};

/**
 * お題の語を、比較しやすい形へ分解する ("firefox-wasm" → ["firefox", "wasm"])。
 * 画面に出すときのために、大文字小文字は元のまま残す（比較する側が lower にそろえる）
 */
export const taskTerms = (task: string): string[] => {
  const seen = new Map<string, string>();
  for (const word of task.split(/[^A-Za-z0-9]+/)) {
    const lower = word.toLowerCase();
    if (lower.length >= 3 && !seen.has(lower)) {
      seen.set(lower, word);
    }
  }
  return Array.from(seen.values());
};

/**
 * 鍵が無いときの簡易判定。お題の語が URL・タイトルにあれば強く、本文だけなら弱く数える。
 * 意味は分からないので、確からしさ (confidence) は主張しない
 */
export const localJudge = ({task, page}: JudgeRequest): JudgeResult => {
  const terms = taskTerms(task);
  const head = `${page.url} ${page.title}`.toLowerCase();
  const body = page.text.toLowerCase();

  let hits = 0;
  const found: string[] = [];
  const missing: string[] = [];
  for (const term of terms) {
    const lower = term.toLowerCase();
    if (head.includes(lower)) {
      hits += 2;
      found.push(term);
    } else if (body.includes(lower)) {
      hits += 1;
      found.push(term);
    } else {
      missing.push(term);
    }
  }
  const score = terms.length > 0 ? hits / (terms.length * 2) : 0;
  return {
    verdict: verdictFor(score),
    score,
    confidence: 0.5,
    reasons: localReasons(found, missing),
    source: "heuristic",
  };
};

const verdictFor = (score: number): JudgeVerdict =>
  score >= MATCH_AT ? "match" : score >= PARTIAL_AT ? "partial" : "mismatch";

const localReasons = (found: string[], missing: string[]): string[] => {
  if (found.length === 0) {
    const asked = missing
      .slice(0, 2)
      .map((term) => `「${term}」`)
      .join("・");
    return [`お題の語 ${asked} がページに見つかりません`];
  }
  const hit = found
    .slice(0, 2)
    .map((term) => `「${term}」`)
    .join("・");
  return missing.length === 0
    ? [`お題の語 ${hit} がページにあります`]
    : [
        `お題の語 ${hit} がページにあります`,
        `見つからない語: ${missing
          .slice(0, 2)
          .map((term) => `「${term}」`)
          .join("・")}`,
      ];
};

/**
 * 判定する。まず Worker の `/judge` (本物の Clef) を試し、届かなければ簡易判定にする。
 * 送る前に上限まで切り詰める (Worker が受ける大きさに収める)。送れない形 (http(s) でない URL など) なら
 * 送らずに簡易判定にする。例外は投げない (画面には必ず何かを出す)
 */
export const runJudge = async (
  request: JudgeRequest,
  doFetch: typeof fetch = fetch,
): Promise<JudgeResult> => {
  const body = normalizeJudgeRequest(request);
  if (!body) {
    return localJudge(request);
  }
  try {
    const response = await doFetch(JUDGE_ENDPOINT, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return localJudge(request);
    }
    return parseJudgeResult(await response.json()) ?? localJudge(request);
  } catch {
    return localJudge(request);
  }
};

/** Worker の応答を検証する。形が違えば null */
export const parseJudgeResult = (value: unknown): JudgeResult | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const {verdict, source} = record;
  if (verdict !== "match" && verdict !== "partial" && verdict !== "mismatch") {
    return null;
  }
  if (source !== "clef" && source !== "heuristic" && source !== "dev") {
    return null;
  }
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.filter(
        (reason): reason is string => typeof reason === "string",
      )
    : [];
  return {
    verdict,
    score: unit(record.score),
    confidence: unit(record.confidence),
    reasons,
    source,
  };
};

const unit = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;

type Options = {
  judge?: (request: JudgeRequest) => Promise<JudgeResult>;
};

/** 今の判定の状態を持つ。判定を始めるたびに、前の結果は捨てる */
export const createJudgeStore = ({judge = runJudge}: Options = {}) => {
  let state: JudgeState = {status: "idle"};
  let seq = 0;
  const listeners = new Set<() => void>();
  const set = (next: JudgeState) => {
    state = next;
    for (const listener of Array.from(listeners)) {
      listener();
    }
  };
  return {
    getState: (): JudgeState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 判定する。新しい判定が始まれば、古い応答は捨てる */
    run: async (request: JudgeRequest): Promise<void> => {
      seq += 1;
      const id = seq;
      const {task, page} = request;
      set({status: "running", task, url: page.url});
      let result: JudgeResult;
      try {
        result = await judge(request);
      } catch (error) {
        if (id === seq) {
          set({
            status: "error",
            task,
            url: page.url,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      if (id === seq) {
        set({status: "done", task, url: page.url, result});
      }
    },
    /** 判定を始められなかった（ページが読めないなど）。画面には理由を出す */
    fail: (task: string, url: string, message: string): void => {
      seq += 1;
      set({status: "error", task, url, message});
    },
    /** 何も判定していない状態へ戻す (PC から離れたときなど) */
    reset: (): void => {
      seq += 1;
      if (state.status !== "idle") {
        set({status: "idle"});
      }
    },
  };
};

export type JudgeStore = ReturnType<typeof createJudgeStore>;

export const judgeStore = createJudgeStore();

export const useJudge = (store: JudgeStore = judgeStore): JudgeState =>
  useSyncExternalStore(store.subscribe, store.getState);

const VERDICT_LABEL: Record<JudgeVerdict, string> = {
  match: "一致",
  partial: "一部一致",
  mismatch: "不一致",
};

const SOURCE_LABEL: Record<JudgeResult["source"], string> = {
  clef: "Clef",
  heuristic: "簡易判定",
  dev: "dev 判定",
};

/** 画面 (CRT) に出す通知の行。出さないときは null */
export const judgeNotice = (state: JudgeState): string[] | null => {
  if (state.status === "idle") {
    return null;
  }
  if (state.status === "running") {
    return [`判定中… お題「${state.task}」`];
  }
  if (state.status === "error") {
    return ["判定できませんでした", state.message];
  }
  const {result, task} = state;
  const source = SOURCE_LABEL[result.source];
  return [
    `判定: ${VERDICT_LABEL[result.verdict]} ${Math.round(result.score * 100)}% ・ ${source}`,
    `お題「${task}」`,
    ...result.reasons,
  ];
};

/**
 * 画面に出す 1 回ぶんの知らせ。出さないときは null。
 *
 * 彼らは黙って見ているので、判定中は何も出さない。合っていれば一言だけで、画面は乱さない。
 * **外れているときだけ**、CRT を一瞬乱してから理由を出す (介入)。判定できなかったときは黙らずに出す
 */
export const judgeAnnouncement = (
  state: JudgeState,
): JudgeAnnouncement | null => {
  if (state.status === "running" || state.status === "idle") {
    return null;
  }
  const lines = judgeNotice(state);
  if (!lines) {
    return null;
  }
  if (state.status === "error") {
    return {lines, tear: false, ms: ERROR_MS};
  }
  if (state.result.verdict === "match") {
    return {lines: ["お題に合っている"], tear: false, ms: CONFIRM_MS};
  }
  return {lines, tear: true, ms: INTERVENE_MS};
};
