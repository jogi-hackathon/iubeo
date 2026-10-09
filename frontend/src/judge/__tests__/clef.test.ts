import {describe, expect, it, vi} from "vitest";

import {
  answersToResult,
  askClef,
  buildClefState,
  clefRequest,
  clip,
  CLEF_MODEL,
  CLEF_MODEL_ID,
  ClefError,
  type ClefBinding,
  MAX_PAGE_TEXT,
  RELEVANCE_LEVELS,
} from "../clef";

const request = {
  task: "WISP protocol",
  page: {
    url: "https://example.com/wisp",
    title: "  WISP\n protocol  ",
    text: "hello",
  },
};

/** Clef が返す形（System One API の answers と同じ） */
const answers = {
  query_on_topic: {type: "noul", noul: 0.97},
  page_on_topic: {type: "noul", noul: 0.9},
  relevance: {
    type: "score",
    score: 2.4,
    legend: {"0": RELEVANCE_LEVELS[0], "1": RELEVANCE_LEVELS[1]},
    probabilities: {"0": 0, "1": 0.1, "2": 0.5, "3": 0.4},
    confidence: 0.8,
  },
  verdict: {
    type: "choice",
    choice: "match",
    probabilities: {match: 0.82, partial: 0.15, mismatch: 0.03},
    confidence: 0.82,
  },
};

describe("buildClefState", () => {
  it("お題と、今見ているページを 1 つの state にまとめる", () => {
    const state = buildClefState(request);
    expect(state).toContain('"WISP protocol"');
    expect(state).toContain("URL: https://example.com/wisp");
    expect(state).toContain("Title: WISP protocol");
    expect(state).toContain("Text: hello");
  });

  it("長い本文は切り詰める（通信と入力を抑える）", () => {
    const text = "a".repeat(MAX_PAGE_TEXT + 500);
    const state = buildClefState({
      ...request,
      page: {url: "", title: "", text},
    });
    expect(state).toContain("…");
    expect(state.length).toBeLessThan(MAX_PAGE_TEXT + 400);
  });
});

describe("clefRequest", () => {
  it("モデルは clef-flash を指定し、質問はお題を埋め込んで組み立てる", () => {
    const body = clefRequest(request);
    expect(body.model).toBe(CLEF_MODEL);
    expect(body.questions.verdict.type).toBe("choice");
    expect(Object.keys(body.questions.verdict.criteria)).toEqual([
      "match",
      "partial",
      "mismatch",
    ]);
    expect(body.questions.verdict.instructions).toContain("WISP protocol");
    expect(body.questions.relevance.criteria).toHaveLength(
      RELEVANCE_LEVELS.length,
    );
  });

  it("同じお題なら、どの質問にもお題が入る（state が長くても文脈を失わない）", () => {
    const {questions} = clefRequest(request);
    expect(questions.query_on_topic.instructions).toContain("WISP protocol");
    expect(questions.page_on_topic.instructions).toContain("WISP protocol");
  });
});

describe("answersToResult", () => {
  it("Clef の答えを、画面に出す形へ畳む", () => {
    expect(answersToResult(answers)).toEqual({
      verdict: "match",
      score: 0.8,
      confidence: 0.82,
      reasons: [
        "検索がお題の語を指しています",
        "ページの内容がお題についてです",
      ],
      source: "clef",
    });
  });

  it("お題と違うページなら、そういう理由になる", () => {
    const result = answersToResult({
      ...answers,
      query_on_topic: {type: "noul", noul: 0.1},
      page_on_topic: {type: "noul", noul: 0.05},
      verdict: {type: "choice", choice: "mismatch", confidence: 0.9},
    });
    expect(result?.verdict).toBe("mismatch");
    expect(result?.reasons).toEqual([
      "検索がお題と違う語を指しているようです",
      "ページの内容がお題と別の話題です",
    ]);
  });

  it("Score が無ければ、選んだ選択肢から一致度を作る", () => {
    const result = answersToResult({
      verdict: {type: "choice", choice: "partial", confidence: 0.7},
    });
    expect(result?.score).toBe(0.5);
    expect(result?.reasons).toHaveLength(1);
  });

  it("選択肢が無い・知らない値なら null（Clef 以外の応答を混ぜない）", () => {
    expect(answersToResult(undefined)).toBeNull();
    expect(answersToResult({})).toBeNull();
    expect(answersToResult({verdict: {choice: "maybe"}})).toBeNull();
  });

  it("確率や confidence が範囲外でも 0..1 に収める", () => {
    const result = answersToResult({
      verdict: {type: "choice", choice: "match", confidence: 4},
      relevance: {type: "score", score: 99},
    });
    expect(result?.confidence).toBe(1);
    expect(result?.score).toBe(1);
  });
});

describe("clip", () => {
  it("改行と連続する空白を 1 つに畳む", () => {
    expect(clip("  a \n\t b  ", 100)).toBe("a b");
  });

  it("上限を超えたら末尾を省く", () => {
    expect(clip("abcdef", 4)).toBe("abcd…");
  });
});

describe("askClef", () => {
  it("binding が無ければ unconfigured（呼ぶ側が 503 にする）", async () => {
    await expect(askClef(undefined, request)).rejects.toMatchObject({
      failure: "unconfigured",
    });
  });

  it("Clef が失敗したら、理由を持った ClefError にする", async () => {
    const rejected: ClefBinding = {
      run: async () => {
        throw new Error("boom");
      },
    };
    await expect(askClef(rejected, request)).rejects.toBeInstanceOf(ClefError);

    const unusable: ClefBinding = {
      run: async () => ({answers: {verdict: {}}}),
    };
    await expect(askClef(unusable, request)).rejects.toMatchObject({
      failure: "unusable",
    });
  });

  it("モデル ID と System One の本体で run を呼び、答えを畳んで返す", async () => {
    const ai: ClefBinding = {
      run: vi.fn(async () => ({model: CLEF_MODEL, answers})),
    };
    await expect(askClef(ai, request)).resolves.toMatchObject({
      verdict: "match",
      source: "clef",
    });
    expect(ai.run).toHaveBeenCalledWith(
      CLEF_MODEL_ID,
      expect.objectContaining({model: "clef-flash"}),
      expect.objectContaining({signal: expect.any(AbortSignal)}),
    );
  });
});
