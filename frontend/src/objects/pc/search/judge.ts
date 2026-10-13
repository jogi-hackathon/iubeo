import {useSyncExternalStore} from "react";

import {normalizeJudgeRequest} from "../../../judge/request";
import type {
  JudgeRequest,
  JudgeResult,
  JudgeVerdict,
  PageSnapshot,
} from "../../../judge/types";

export type {JudgeRequest, JudgeResult, JudgeVerdict, PageSnapshot};

export const JUDGE_ENDPOINT = import.meta.env.VITE_JUDGE_URL ?? "/judge";
export const JUDGE_TIMEOUT_MS = 8000;
const MATCH_AT = 0.6;
const PARTIAL_AT = 0.25;
const INTERVENE_MS = 9000;
export const CONFIRM_MS = 3000;
const ERROR_MS = 6000;

export type JudgeState =
  | {status: "idle"}
  | {status: "running"; task: string; url: string}
  | {status: "done"; task: string; url: string; result: JudgeResult}
  | {status: "error"; task: string; url: string; message: string};

export type JudgeAnnouncement = {
  lines: string[];
  tear: boolean;
  ms: number;
};

export const taskTerms = (task: string): string[] => {
  const seen = new Map<string, string>();
  for (const word of task.split(/[^\p{L}\p{N}]+/u)) {
    const lower = word.toLowerCase();
    const min = /^[A-Za-z0-9]+$/.test(word) ? 3 : 2;
    if (lower.length >= min && !seen.has(lower)) {
      seen.set(lower, word);
    }
  }
  return Array.from(seen.values());
};

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
    fail: (task: string, url: string, message: string): void => {
      seq += 1;
      set({status: "error", task, url, message});
    },
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
