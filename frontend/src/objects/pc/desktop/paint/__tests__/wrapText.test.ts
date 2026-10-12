import {describe, expect, it} from "vitest";

import {wrapText} from "../controls";

// 1 文字 10px として測る
const ctx = {
  measureText: (s: string) => ({width: [...s].length * 10}),
} as unknown as CanvasRenderingContext2D;

describe("wrapText", () => {
  it("日本語は 1 文字ずつ折り返す", () => {
    expect(wrapText(ctx, "あいうえおかきく", 50)).toEqual([
      "あいうえお",
      "かきく",
    ]);
  });

  it("英数字の続きは語の途中で切らずに次の行へ送る", () => {
    expect(wrapText(ctx, "502 Bad Gateway", 100)).toEqual([
      "502 Bad",
      "Gateway",
    ]);
  });

  it("行頭の空白は落とす", () => {
    expect(wrapText(ctx, "abcd efgh", 40)).toEqual(["abcd", "efgh"]);
  });

  it("1 語だけで幅を超えるときは、その語も文字で切る", () => {
    expect(wrapText(ctx, "abcdefghij", 40)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("空の文は行を作らない", () => {
    expect(wrapText(ctx, "", 40)).toEqual([]);
  });
});
