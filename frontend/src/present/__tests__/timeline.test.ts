import {describe, expect, it} from "vitest";

import {
  CLOSE_LID_DURATION_MS,
  CLOSE_LID_KEYS,
  LID_DURATION_MS,
  lidAt,
  LOGO_FADE_OUT_MS,
  LOGO_FADE_OUT_START_MS,
  logoFadeOutAt,
  LOGO_TURN_MS,
  typedText,
} from "../timeline";

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

describe("lidAt(目を閉じる)", () => {
  it("開いた目から始まり、最後は閉じきってぼやける", () => {
    expect(lidAt(0, CLOSE_LID_KEYS).open).toBeGreaterThan(2);
    const end = lidAt(CLOSE_LID_DURATION_MS, CLOSE_LID_KEYS);
    expect(end.open).toBe(0);
    expect(end.blur).toBeGreaterThan(0);
  });
});

describe("logoFadeOutAt", () => {
  it("1 秒待ってから 1 秒かけて消え、真っ黒のまま 1 秒待ってから転換する", () => {
    expect(logoFadeOutAt(0)).toBe(1);
    expect(logoFadeOutAt(LOGO_FADE_OUT_START_MS)).toBe(1);
    expect(logoFadeOutAt(LOGO_FADE_OUT_START_MS + LOGO_FADE_OUT_MS / 2)).toBe(
      0.5,
    );
    expect(logoFadeOutAt(LOGO_FADE_OUT_START_MS + LOGO_FADE_OUT_MS)).toBe(0);
    expect(LOGO_FADE_OUT_START_MS).toBe(3200);
    expect(LOGO_TURN_MS).toBe(LOGO_FADE_OUT_START_MS + LOGO_FADE_OUT_MS + 1000);
  });
});
