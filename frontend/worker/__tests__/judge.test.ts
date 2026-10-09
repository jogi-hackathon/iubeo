import {describe, expect, it, vi} from "vitest";

import {handleJudge, JUDGE_PATH} from "../judge";

const input = {
  task: "Vite",
  page: {
    url: "https://vitejs.dev/guide/",
    title: "Getting Started | Vite",
    text: "Next generation frontend tooling",
  },
};

/** Clef が返す形（System One API の answers と同じ） */
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

const post = (body: unknown, ai?: {run: unknown}): Promise<Response> =>
  handleJudge(
    new Request(`https://iubeo.test${JUDGE_PATH}`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    {AI: ai as never},
  );

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
});
