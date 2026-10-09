import {askClef, ClefError} from "../src/judge/clef";
import type {JudgeRequest} from "../src/judge/types";

/**
 * Web Search の判定の受け口（フロントの Worker）。
 *
 * 画面からは同じオリジンの `/judge` を叩き、ここが Workers AI の binding (env.AI) で
 * Clef (`@cf/cloudflare/clef-flash`) を呼び、答えを画面に出す形へ畳んで返す。
 * 同じ Worker の中で完結するので、外部 API への往復も API キーも要らない。
 *
 * binding が無い環境では 503 を返し、画面側は簡易判定に落ちる。
 */

/** 判定のパス（cloudflare.config.ts の runWorkerFirst と揃える） */
export const JUDGE_PATH = "/judge";

type Env = {
  /** Workers AI の binding（cloudflare.config.ts の `AI: bindings.ai()`） */
  AI?: Ai;
};

export const handleJudge = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({error: "method not allowed"}, 405);
  }

  let input: JudgeRequest;
  try {
    input = (await request.json()) as JudgeRequest;
  } catch {
    return json({error: "invalid json"}, 400);
  }
  if (!input || typeof input.task !== "string" || !input.page) {
    return json({error: "task and page are required"}, 400);
  }

  try {
    return json(await askClef(env.AI, input), 200);
  } catch (error) {
    if (error instanceof ClefError) {
      return json(
        {error: error.message},
        error.failure === "unconfigured" ? 503 : 502,
      );
    }
    return json({error: "judge failed"}, 502);
  }
};

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: {"cache-control": "no-store"},
  });
