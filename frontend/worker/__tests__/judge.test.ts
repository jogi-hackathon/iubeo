import {describe, expect, it, vi} from "vitest";

import {MAX_JUDGE_BODY_BYTES, MAX_TASK} from "../../src/judge/request";
import {handleJudge, JUDGE_PATH, readBody} from "../judge";

const input = {
  task: "Vite",
  page: {
    url: "https://vitejs.dev/guide/",
    title: "Getting Started | Vite",
    text: "Next generation frontend tooling",
  },
};

const clefAnswers = {
  query_on_topic: {type: "noul", noul: 0.98},
  page_on_topic: {type: "noul", noul: 0.95},
  relevance: {type: "score", score: 2.7, confidence: 0.9},
  verdict: {
    type: "choice",
    choice: "match",
    probabilities: {match: 0.93, partial: 0.06, mismatch: 0.01},
    confidence: 0.88,
  },
};

const aiReturning = (output: unknown) => ({
  run: vi.fn(
    async (
      _model: string,
      _inputs: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => output as Record<string, unknown>,
  ),
});

const ORIGIN = "https://iubeo.test";

const judgeRequest = (
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request(`${ORIGIN}${JUDGE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const post = (body: unknown, ai?: {run: unknown}): Promise<Response> =>
  handleJudge(judgeRequest(body), {AI: ai as never});

const limiter = (success: boolean) => ({
  limit: vi.fn(async (_options: {key: string}) => ({success})),
});

describe("handleJudge", () => {
  it("POST 以外は受けない", async () => {
    const response = await handleJudge(
      new Request(`https://iubeo.test${JUDGE_PATH}`),
      {AI: aiReturning({}) as never},
    );
    expect(response.status).toBe(405);
  });

  it("壊れた本文・足りない項目は 400", async () => {
    const ai = aiReturning({});
    expect((await post("not json", ai)).status).toBe(400);
    expect((await post({page: input.page}, ai)).status).toBe(400);
    expect((await post({task: "Vite"}, ai)).status).toBe(400);
  });

  it("AI binding が無ければ 503（画面は簡易判定に落ちる）", async () => {
    const response = await post(input, undefined);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "judge is not configured",
    });
  });

  it("binding があれば Clef を呼び、答えを画面に出す形で返す", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});

    const response = await post(input, ai);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      verdict: "match",
      score: 0.9,
      confidence: 0.88,
      reasons: [
        "検索がお題の語を指しています",
        "ページの内容がお題についてです",
      ],
      source: "clef",
    });

    const [model, body] = ai.run.mock.calls[0]!;
    expect(model).toBe("@cf/cloudflare/clef-flash");
    expect(body.model).toBe("clef-flash");
    expect(String(body.state)).toContain("Vite");
    expect(Object.keys(body.questions as Record<string, unknown>)).toEqual([
      "query_on_topic",
      "page_on_topic",
      "relevance",
      "verdict",
    ]);
  });

  it("Clef が失敗したら 502（画面は簡易判定に落ちる）", async () => {
    const ai = {
      run: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    expect((await post(input, ai)).status).toBe(502);
  });

  it("Clef が使えない答えを返したら 502", async () => {
    const ai = aiReturning({answers: {verdict: {}}});
    expect((await post(input, ai)).status).toBe(502);
  });

  it("別のオリジン・Origin の無い呼び出しは 403（Clef を呼ばない）", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});
    const env = {AI: ai as never};
    const cases: Record<string, string>[] = [
      {origin: "https://evil.test", "sec-fetch-site": "cross-site"},
      {origin: ORIGIN, "sec-fetch-site": "cross-site"},
      {origin: ""},
    ];
    for (const headers of cases) {
      expect(
        (await handleJudge(judgeRequest(input, headers), env)).status,
      ).toBe(403);
    }
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("回数の上限を超えたら 429（IP ごと・全体のどちらでも。Clef を呼ばない）", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});
    const ok = await handleJudge(
      judgeRequest(input, {"cf-connecting-ip": "203.0.113.1"}),
      {
        AI: ai as never,
        JUDGE_IP_LIMIT: limiter(true) as never,
        JUDGE_GLOBAL_LIMIT: limiter(true) as never,
      },
    );
    expect(ok.status).toBe(200);

    const perIp = limiter(false);
    expect(
      (
        await handleJudge(
          judgeRequest(input, {"cf-connecting-ip": "203.0.113.1"}),
          {AI: ai as never, JUDGE_IP_LIMIT: perIp as never},
        )
      ).status,
    ).toBe(429);
    expect(perIp.limit).toHaveBeenCalledWith({key: "203.0.113.1"});

    expect(
      (
        await handleJudge(judgeRequest(input), {
          AI: ai as never,
          JUDGE_GLOBAL_LIMIT: limiter(false) as never,
        })
      ).status,
    ).toBe(429);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it("本文が大きすぎたら 413（Clef を呼ばない）", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});
    const huge = {
      ...input,
      page: {...input.page, text: "a".repeat(MAX_JUDGE_BODY_BYTES)},
    };
    expect((await post(huge, ai)).status).toBe(413);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("http(s) でない URL は 400", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});
    const response = await post(
      {...input, page: {...input.page, url: "javascript:alert(1)"}},
      ai,
    );
    expect(response.status).toBe(400);
  });

  it("長いお題は切り詰めてから Clef に渡す", async () => {
    const ai = aiReturning({model: "clef-flash", answers: clefAnswers});
    await post({...input, task: "x".repeat(MAX_TASK * 10)}, ai);
    const [, body] = ai.run.mock.calls[0]!;
    expect(String(body.state)).not.toContain("x".repeat(MAX_TASK + 1));
  });
});

describe("readBody", () => {
  it("上限を超えたら、Content-Length が無くても null", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    const request = new Request(`${ORIGIN}${JUDGE_PATH}`, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBody(request, 15)).toBeNull();
  });

  it("上限以内なら文字列で返す", async () => {
    const request = new Request(`${ORIGIN}${JUDGE_PATH}`, {
      method: "POST",
      body: "検索",
    });
    expect(await readBody(request, 100)).toBe("検索");
  });
});
