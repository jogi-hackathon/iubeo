import {describe, expect, it} from "vitest";

import {parseKodawari} from "../kodawariMarkdown";

const SAMPLE = `<!--
説明
-->

# 2 つのこだわり

## ブラウザへのこだわり

名前: ブラウザ
色: #1D6FE0

> 台詞です

- 本物のエンジンを動かした
  - iframe ではない
  - モックでもない
- 検索画面を自作した

## 世界観へのこだわり

名前: 世界観
色: #e63946

- 机と椅子 {light}
- デスクトップ {pc}
`;

describe("parseKodawari", () => {
  it("見出し・名前・色・台詞・項目と補足・実物を読む", () => {
    const deck = parseKodawari(SAMPLE);
    expect(deck.title).toBe("2 つのこだわり");
    expect(deck.items).toEqual([
      {
        key: "1",
        label: "ブラウザ",
        title: "ブラウザへのこだわり",
        color: "#1d6fe0",
        line: "台詞です",
        points: [
          {
            text: "本物のエンジンを動かした",
            sub: ["iframe ではない", "モックでもない"],
          },
          {text: "検索画面を自作した"},
        ],
      },
      {
        key: "2",
        label: "世界観",
        title: "世界観へのこだわり",
        color: "#e63946",
        line: "机と椅子",
        points: [
          {text: "机と椅子", scene: "light"},
          {text: "デスクトップ", scene: "pc"},
        ],
      },
    ]);
  });

  it("台詞が無ければ最初の項目を台詞にする", () => {
    expect(parseKodawari(SAMPLE).items[1]!.line).toBe("机と椅子");
  });

  it("描けない実物は行番号付きで投げる", () => {
    expect(() =>
      parseKodawari("# t\n## a\n名前: a\n色: #000000\n- x {sea}\n"),
    ).toThrow("kodawari.md 5 行目");
  });

  it("名前や色が無いこだわりは投げる", () => {
    expect(() => parseKodawari("# t\n## a\n色: #000000\n- x\n")).toThrow(
      "名前:",
    );
    expect(() => parseKodawari("# t\n## a\n名前: a\n- x\n")).toThrow("色:");
  });

  it("読めない行は投げる(コメントを消しても行番号は変わらない)", () => {
    expect(() =>
      parseKodawari("<!--\n\n-->\n# t\n## a\n名前: a\n色: #000000\nなにか\n"),
    ).toThrow("kodawari.md 8 行目: 読めない行");
  });
});
