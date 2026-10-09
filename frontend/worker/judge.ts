import {askClef, ClefError} from "../src/judge/clef";
import {
  MAX_JUDGE_BODY_BYTES,
  normalizeJudgeRequest,
} from "../src/judge/request";

/**
 * Web Search の判定の受け口（フロントの Worker）。
 *
 * 画面からは同じオリジンの `/judge` を叩き、ここが Workers AI の binding (env.AI) で
 * Clef (`@cf/cloudflare/clef-flash`) を呼び、答えを画面に出す形へ畳んで返す。
 * 同じ Worker の中で完結するので、外部 API への往復も API キーも要らない。
 *
 * binding が無い環境では 503 を返し、画面側は簡易判定に落ちる。
 *
 * Workers AI は従量課金なので、誰でも叩ける入口にしない。Clef を呼ぶ前に、安い順に弾く:
 * 1. 同じオリジンの画面からの呼び出しだけ受ける (Origin / Sec-Fetch-Site。403)
 * 2. 回数を絞る (IP ごとと、全体の 2 段。Rate Limiting の binding。429)
 * 3. 本文の大きさを絞る (MAX_JUDGE_BODY_BYTES。413)
 * 4. 形を検証し、各項目を上限まで切り詰める (normalizeJudgeRequest。400)
 *
 * どれで弾かれても、画面は簡易判定に落ちる (runJudge は ok 以外を簡易判定にする)。
 * 1 はヘッダーを偽れる相手 (curl など) には効かない。そこは 2 と 3 で上限を抑える。
 */

/** 判定のパス（cloudflare.config.ts の runWorkerFirst と揃える） */
export const JUDGE_PATH = "/judge";

type Env = {
  /** Workers AI の binding（cloudflare.config.ts の `AI: bindings.ai()`） */
  AI?: Ai;
  /** IP ごとの回数の上限（cloudflare.config.ts の `JUDGE_IP_LIMIT`）。無ければ絞らない */
  JUDGE_IP_LIMIT?: RateLimit;
  /** 全体の回数の上限（cloudflare.config.ts の `JUDGE_GLOBAL_LIMIT`）。無ければ絞らない */
  JUDGE_GLOBAL_LIMIT?: RateLimit;
};

/** 全体の上限の key。全員で 1 つの枠を使う */
const GLOBAL_KEY = "judge";

export const handleJudge = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({error: "method not allowed"}, 405);
  }

  if (!isSameOrigin(request)) {
    return json({error: "forbidden"}, 403);
  }
  if (!(await withinLimits(request, env))) {
    return json({error: "too many requests"}, 429);
  }

  const body = await readBody(request, MAX_JUDGE_BODY_BYTES);
  if (body === null) {
    return json({error: "payload too large"}, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({error: "invalid json"}, 400);
  }
  const input = normalizeJudgeRequest(parsed);
  if (!input) {
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

/**
 * 同じオリジンの画面からの呼び出しか。ブラウザは POST の fetch に必ず Origin を付けるので、無ければ受けない。
 * Sec-Fetch-Site があれば same-origin であることも見る
 */
export const isSameOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return false;
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
};

/** IP ごと・全体の両方の枠に収まっているか。binding が無い枠は見ない */
const withinLimits = async (request: Request, env: Env): Promise<boolean> => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const [perIp, global] = await Promise.all([
    env.JUDGE_IP_LIMIT?.limit({key: ip}),
    env.JUDGE_GLOBAL_LIMIT?.limit({key: GLOBAL_KEY}),
  ]);
  return perIp?.success !== false && global?.success !== false;
};

/**
 * 本文を上限まで読む。上限を超えたら読むのをやめて null。
 * Content-Length は付かないこともある (chunked) ので、宣言だけでなく実際に読んだ量でも見る
 */
export const readBody = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return null;
  }
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

const json = (body: unknown, status: number): Response =>
  Response.json(body, {
    status,
    headers: {"cache-control": "no-store"},
  });
