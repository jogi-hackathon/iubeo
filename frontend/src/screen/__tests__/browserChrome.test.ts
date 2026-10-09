import {describe, expect, it} from "vitest";

import {
  type AddressEdit,
  addressDraftFor,
  applyAddressKey,
  applyAddressText,
  CONTENT_HEIGHT,
  displayUrl,
  hitToolbar,
  normalizeAddress,
  removeLastChar,
  SCREEN_CANVAS,
  SEARCH_PAGE_URL,
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

  it("それ以外は検索にする（空白は含めて検索語にする）", () => {
    expect(normalizeAddress("WebAssembly")).toBe(
      `${SEARCH_PAGE_URL}?q=WebAssembly`,
    );
    expect(normalizeAddress("firefox wasm")).toBe(
      `${SEARCH_PAGE_URL}?q=firefox%20wasm`,
    );
  });

  it("検索は Google へ送る（本番は WISP を EC2 の EIP 経由にして reCAPTCHA を避けている）", () => {
    expect(SEARCH_PAGE_URL).toBe("https://www.google.com/search");
    expect(normalizeAddress("Gecko engine")).toBe(
      "https://www.google.com/search?q=Gecko%20engine",
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

const edit = (text: string, selectAll = false): AddressEdit => ({
  text,
  selectAll,
});
const plain = {ctrl: false, meta: false};
const key = (
  k: string,
  charCode = 0,
  modifiers = plain,
): {key: string; charCode: number; modifiers: typeof plain} => ({
  key: k,
  charCode,
  modifiers,
});

describe("applyAddressKey", () => {
  it("普通の文字は末尾に足す", () => {
    expect(applyAddressKey(edit("abc"), key("d", 0x64))).toEqual(edit("abcd"));
  });

  it("Backspace は末尾の 1 文字を消す", () => {
    expect(applyAddressKey(edit("abc"), key("Backspace"))).toEqual(edit("ab"));
  });

  it("⌘A / Ctrl+A で全選択になる（空なら選ぶものが無い）", () => {
    for (const modifiers of [
      {ctrl: false, meta: true},
      {ctrl: true, meta: false},
    ]) {
      expect(applyAddressKey(edit("abc"), key("a", 0, modifiers))).toEqual(
        edit("abc", true),
      );
    }
    expect(
      applyAddressKey(edit(""), key("a", 0, {ctrl: false, meta: true})),
    ).toEqual(edit(""));
  });

  it("全選択の次の 1 文字で全体が置き換わる", () => {
    const selected = applyAddressKey(
      edit("https://example.com/"),
      key("a", 0, {ctrl: true, meta: false}),
    );
    expect(applyAddressKey(selected, key("x", 0x78))).toEqual(edit("x"));
  });

  it("⌘⌫ / Ctrl+Backspace で全部消える", () => {
    for (const modifiers of [
      {ctrl: false, meta: true},
      {ctrl: true, meta: false},
    ]) {
      expect(
        applyAddressKey(
          edit("https://example.com/"),
          key("Backspace", 0, modifiers),
        ),
      ).toEqual(edit(""));
    }
  });

  it("全選択中の Backspace / Delete / ⌘Delete でも全部消える", () => {
    for (const k of ["Backspace", "Delete"]) {
      expect(applyAddressKey(edit("abc", true), key(k))).toEqual(edit(""));
    }
    expect(
      applyAddressKey(edit("abc"), key("Delete", 0, {ctrl: true, meta: false})),
    ).toEqual(edit(""));
  });

  it("カーソルは末尾だけなので、Delete 単体では何も起きない", () => {
    expect(applyAddressKey(edit("abc"), key("Delete"))).toEqual(edit("abc"));
  });

  it("修飾キー付きの文字（charCode 0）や対象外のキーは状態を変えない", () => {
    const state = edit("abc");
    expect(applyAddressKey(state, key("x", 0, {ctrl: true, meta: false}))).toBe(
      state,
    );
    expect(applyAddressKey(state, key("ArrowLeft"))).toBe(state);
  });
});

describe("applyAddressText", () => {
  it("改行を除いて末尾に足す", () => {
    expect(applyAddressText(edit("abc"), "d\ne\nf")).toEqual(edit("abcdef"));
  });

  it("全選択中は置き換わる（貼り付け・IME の確定）", () => {
    expect(applyAddressText(edit("abc", true), "貼り付け")).toEqual(
      edit("貼り付け"),
    );
  });
});
