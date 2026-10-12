import {describe, expect, it} from "vitest";

import {LID_DURATION_MS, lidAt, typedText} from "../timeline";

describe("typedText", () => {
  it("delay までは空で、そのあと 1 文字ずつ増え、全文で止まる", () => {
    expect(typedText("調べて", 99, 50, 100)).toBe("");
    expect(typedText("調べて", 150, 50, 100)).toBe("調");
    expect(typedText("調べて", 10_000, 50, 100)).toBe("調べて");
  });
});

describe("lidAt", () => {
  it("閉じた目から始まり、最後は画面の隅まで開いてぼかしが消える", () => {
    expect(lidAt(0).open).toBe(0);
    const end = lidAt(LID_DURATION_MS);
    expect(end.open).toBeGreaterThan(2);
    expect(end.blur).toBe(0);
    expect(lidAt(LID_DURATION_MS + 1000)).toEqual(end);
  });
});
