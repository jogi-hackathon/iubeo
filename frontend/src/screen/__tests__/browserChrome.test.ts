import {describe, expect, it} from "vitest";

import {
  addressDraftFor,
  CONTENT_HEIGHT,
  displayUrl,
  hitToolbar,
  normalizeAddress,
  removeLastChar,
  SCREEN_CANVAS,
  TOOLBAR_HEIGHT,
} from "../browserChrome";

describe("hitToolbar", () => {
  it("戻る・進む・アドレス欄の上なら、その部品を返す", () => {
    expect(hitToolbar(30, 28)).toBe("back");
    expect(hitToolbar(78, 28)).toBe("forward");
    expect(hitToolbar(400, 28)).toBe("address");
  });

  it("枠の外（エンジンの表示の上）と、部品のすき間は null", () => {
    expect(hitToolbar(30, TOOLBAR_HEIGHT + 5)).toBeNull();
    expect(hitToolbar(104, 28)).toBeNull();
    expect(hitToolbar(30, 2)).toBeNull();
  });

  it("画面の大きさは枠とエンジンの表示を足したもの", () => {
    expect(TOOLBAR_HEIGHT + CONTENT_HEIGHT).toBe(SCREEN_CANVAS.height);
  });
});

describe("normalizeAddress", () => {
  it("スキームのある URL はそのまま使う", () => {
    expect(normalizeAddress("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeAddress("about:blank")).toBe("about:blank");
  });

  it("ドメインらしい入力は https にする", () => {
    expect(normalizeAddress("example.com")).toBe("https://example.com");
    expect(normalizeAddress("localhost:5173/x")).toBe(
      "https://localhost:5173/x",
    );
  });

  it("それ以外は Google の検索にする（空白は含めて検索語にする）", () => {
    expect(normalizeAddress("WebAssembly")).toBe(
      "https://www.google.com/search?q=WebAssembly",
    );
    expect(normalizeAddress("firefox wasm")).toBe(
      "https://www.google.com/search?q=firefox%20wasm",
    );
  });

  it("空白だけなら何もしない", () => {
    expect(normalizeAddress("   ")).toBeNull();
  });
});

describe("displayUrl / addressDraftFor", () => {
  it("最初のページ（data:）は about:home と出し、編集の初期値は空にする", () => {
    expect(displayUrl("data:text/html;base64,AAAA")).toBe("about:home");
    expect(addressDraftFor("data:text/html;base64,AAAA")).toBe("");
  });

  it("それ以外の URL はそのまま出し、編集の初期値にする", () => {
    expect(displayUrl("https://example.com/")).toBe("https://example.com/");
    expect(addressDraftFor("https://example.com/")).toBe(
      "https://example.com/",
    );
  });
});

describe("removeLastChar", () => {
  it("末尾の 1 文字を消す（日本語も 1 文字ずつ）", () => {
    expect(removeLastChar("abc")).toBe("ab");
    expect(removeLastChar("検索語")).toBe("検索");
    expect(removeLastChar("")).toBe("");
  });
});
