import {describe, expect, it} from "vitest";

import {
  MAX_PAGE_TEXT,
  MAX_PAGE_TITLE,
  MAX_PAGE_URL,
  MAX_TASK,
  normalizeJudgeRequest,
} from "../request";

const valid = {
  task: "Vite",
  page: {
    url: "https://vitejs.dev/guide/",
    title: "Getting Started | Vite",
    text: "Next generation frontend tooling",
  },
};

describe("normalizeJudgeRequest", () => {
  it("正しい依頼はそのまま返す", () => {
    expect(normalizeJudgeRequest(valid)).toEqual(valid);
  });

  it("形が違えば null", () => {
    expect(normalizeJudgeRequest(null)).toBeNull();
    expect(normalizeJudgeRequest("Vite")).toBeNull();
    expect(normalizeJudgeRequest({task: "Vite"})).toBeNull();
    expect(normalizeJudgeRequest({page: valid.page})).toBeNull();
    expect(
      normalizeJudgeRequest({...valid, page: {...valid.page, text: 1}}),
    ).toBeNull();
  });

  it("空のお題・http(s) でない URL・長すぎる URL は null", () => {
    expect(normalizeJudgeRequest({...valid, task: "  "})).toBeNull();
    for (const url of [
      "data:text/html,hi",
      "javascript:alert(1)",
      "not a url",
      `https://example.com/${"a".repeat(MAX_PAGE_URL)}`,
    ]) {
      expect(
        normalizeJudgeRequest({...valid, page: {...valid.page, url}}),
      ).toBeNull();
    }
  });

  it("お題・タイトル・本文は上限まで切り詰める", () => {
    const result = normalizeJudgeRequest({
      task: "t".repeat(MAX_TASK + 50),
      page: {
        url: valid.page.url,
        title: "a".repeat(MAX_PAGE_TITLE + 50),
        text: "b".repeat(MAX_PAGE_TEXT + 500),
      },
    });
    expect(result?.task.length).toBe(MAX_TASK + 1);
    expect(result?.page.title.length).toBe(MAX_PAGE_TITLE + 1);
    expect(result?.page.text.length).toBe(MAX_PAGE_TEXT + 1);
  });
});
