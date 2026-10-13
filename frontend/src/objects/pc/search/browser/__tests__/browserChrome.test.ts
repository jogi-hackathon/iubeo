import {describe, expect, it} from "vitest";

import {SCREEN_CANVAS} from "../../../display/resolution";
import {
  type AddressEdit,
  addressDraftFor,
  addressEditOf,
  applyAddressKey,
  applyAddressText,
  CONTENT_HEIGHT,
  displayUrl,
  hitToolbar,
  isSearchResultsUrl,
  moveAddressCaret,
  normalizeAddress,
  SEARCH_PAGE_PATH,
  searchPageUrl,
  searchUrlFor,
  selectAddressWord,
  selectedAddressText,
  TOOLBAR_HEIGHT,
} from "../browserChrome";

const ORIGIN = "https://iubeo.example";
const LOCAL = "http://localhost:5173";

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
    expect(normalizeAddress("WebAssembly", ORIGIN, "")).toBe(
      `${ORIGIN}${SEARCH_PAGE_PATH}?q=WebAssembly`,
    );
    expect(normalizeAddress("firefox wasm", ORIGIN, "")).toBe(
      `${ORIGIN}${SEARCH_PAGE_PATH}?q=firefox%20wasm`,
    );
  });

  it("検索は自分のバックエンドの検索ページへ、トークン付きで送る", () => {
    expect(normalizeAddress("Gecko engine", ORIGIN, "tok")).toBe(
      `${ORIGIN}${SEARCH_PAGE_PATH}?q=Gecko%20engine&t=tok`,
    );
  });

  it("空白だけなら何もしない", () => {
    expect(normalizeAddress("   ")).toBeNull();
  });
});

describe("searchPageUrl / searchUrlFor", () => {
  it("検索ページの URL は、アプリと同じオリジンの絶対 URL", () => {
    expect(searchPageUrl(ORIGIN)).toBe(`${ORIGIN}/api/v1/search/page`);
    expect(searchPageUrl(LOCAL)).toBe(`${LOCAL}/api/v1/search/page`);
  });

  it("トークンが空なら t は付けない", () => {
    expect(searchUrlFor("three.js", ORIGIN, "")).toBe(
      `${ORIGIN}/api/v1/search/page?q=three.js`,
    );
  });

  it("トークンがあれば t に入れ、記号は URL の形に直す", () => {
    expect(searchUrlFor("a&b=c", ORIGIN, "x+y/z")).toBe(
      `${ORIGIN}/api/v1/search/page?q=a%26b%3Dc&t=x%2By%2Fz`,
    );
  });
});

describe("isSearchResultsUrl", () => {
  it("アプリの検索ページは、開発・本番のどちらのオリジンでも結果ページ", () => {
    expect(isSearchResultsUrl(searchUrlFor("three.js", LOCAL, "t"))).toBe(true);
    expect(isSearchResultsUrl(searchUrlFor("three.js", ORIGIN, "t"))).toBe(
      true,
    );
  });

  it("アプリの検索ページ以外の API は結果ページではない", () => {
    expect(isSearchResultsUrl(`${ORIGIN}/api/v1/players`)).toBe(false);
  });

  it("Google の結果ページ（各国ドメインも）", () => {
    expect(
      isSearchResultsUrl("https://www.google.co.jp/search?q=three.js&hl=ja"),
    ).toBe(true);
  });

  it("Yahoo! JAPAN の検索結果ページ", () => {
    expect(
      isSearchResultsUrl("https://search.yahoo.co.jp/search?p=three.js"),
    ).toBe(true);
  });

  it("DuckDuckGo lite など、代替の検索の結果ページ", () => {
    expect(isSearchResultsUrl("https://lite.duckduckgo.com/lite/?q=x")).toBe(
      true,
    );
    expect(isSearchResultsUrl("https://duckduckgo.com/?q=x")).toBe(true);
    expect(isSearchResultsUrl("https://www.bing.com/search?q=x")).toBe(true);
  });

  it("普通のページや検索エンジンのトップは「開いたサイト」", () => {
    expect(isSearchResultsUrl("https://threejs.org/docs/")).toBe(false);
    expect(isSearchResultsUrl("https://www.google.com/")).toBe(false);
    expect(isSearchResultsUrl("https://github.com/search?q=x")).toBe(false);
    expect(isSearchResultsUrl("not a url")).toBe(false);
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

type Modifiers = {ctrl: boolean; meta: boolean; alt: boolean; shift: boolean};
const plain: Modifiers = {ctrl: false, meta: false, alt: false, shift: false};
const ctrl: Modifiers = {...plain, ctrl: true};
const meta: Modifiers = {...plain, meta: true};
const alt: Modifiers = {...plain, alt: true};
const shift: Modifiers = {...plain, shift: true};

const key = (k: string, modifiers: Modifiers = plain) => ({
  key: k,
  charCode:
    k.length === 1 && !modifiers.ctrl && !modifiers.meta
      ? k.codePointAt(0)!
      : 0,
  modifiers,
});

const view = ({text, caret, anchor}: AddressEdit) => ({text, caret, anchor});
const at = (text: string, caret: number, anchor = caret) => ({
  text,
  caret,
  anchor,
});

const press = (edit: AddressEdit, ...keys: ReturnType<typeof key>[]) =>
  keys.reduce(applyAddressKey, edit);

describe("addressEditOf", () => {
  it("カーソルは末尾。全選択で始めることもできる", () => {
    expect(view(addressEditOf("abc"))).toEqual(at("abc", 3));
    expect(view(addressEditOf("abc", true))).toEqual(at("abc", 3, 0));
  });
});

describe("applyAddressKey", () => {
  it("文字はカーソルの位置に入る", () => {
    const edit = press(addressEditOf("ac"), key("ArrowLeft"), key("b"));
    expect(view(edit)).toEqual(at("abc", 2));
  });

  it("Backspace は前、Delete は後ろの 1 文字を消す(日本語も 1 文字ずつ)", () => {
    expect(view(press(addressEditOf("検索語"), key("Backspace")))).toEqual(
      at("検索", 2),
    );
    const edit = press(addressEditOf("abc"), key("Home"), key("Delete"));
    expect(view(edit)).toEqual(at("bc", 0));
  });

  it("⌘A / Ctrl+A で全選択し、次の文字で置き換わる", () => {
    for (const modifiers of [meta, ctrl]) {
      const selected = press(
        addressEditOf("https://example.com/"),
        key("a", modifiers),
      );
      expect(view(selected)).toEqual(at("https://example.com/", 20, 0));
      expect(view(press(selected, key("x")))).toEqual(at("x", 1));
    }
  });

  it("選択中の Backspace / Delete / ⌘X は選択を消す", () => {
    for (const k of [
      key("Backspace"),
      key("Delete"),
      key("x", meta),
      key("x", ctrl),
    ]) {
      expect(view(press(addressEditOf("abc", true), k))).toEqual(at("", 0));
    }
  });

  it("⌘⌫ は行頭まで、⌘Delete は行末まで消す", () => {
    const middle = press(
      addressEditOf("abcd"),
      key("ArrowLeft"),
      key("ArrowLeft"),
    );
    expect(view(press(middle, key("Backspace", meta)))).toEqual(at("cd", 0));
    expect(view(press(middle, key("Delete", meta)))).toEqual(at("ab", 2));
  });

  it("Option / Ctrl 付きの Backspace・Delete は 1 単語ずつ消す", () => {
    for (const modifiers of [alt, ctrl]) {
      expect(
        view(press(addressEditOf("foo bar.baz"), key("Backspace", modifiers))),
      ).toEqual(at("foo bar.", 8));
      const edit = press(
        addressEditOf("foo bar"),
        key("Home"),
        key("Delete", modifiers),
      );
      expect(view(edit)).toEqual(at(" bar", 0));
    }
  });

  it("←→ で 1 文字、Option / Ctrl+←→ で 1 単語、⌘←→・Home/End・↑↓ で端へ動く", () => {
    const edit = addressEditOf("foo bar baz");
    expect(press(edit, key("ArrowLeft")).caret).toBe(10);
    expect(press(edit, key("ArrowLeft", alt)).caret).toBe(8);
    expect(
      press(edit, key("ArrowLeft", ctrl), key("ArrowLeft", ctrl)).caret,
    ).toBe(4);
    expect(press(edit, key("Home"), key("ArrowRight", alt)).caret).toBe(3);
    for (const k of [key("ArrowLeft", meta), key("Home"), key("ArrowUp")]) {
      expect(press(edit, k).caret).toBe(0);
    }
    for (const k of [key("ArrowRight", meta), key("End"), key("ArrowDown")]) {
      expect(press(edit, key("Home"), k).caret).toBe(11);
    }
  });

  it("Shift を足すと選択が広がり、Shift なしの←→は選択の端へたたむ", () => {
    const selected = press(
      addressEditOf("abcd"),
      key("ArrowLeft", shift),
      key("ArrowLeft", shift),
    );
    expect(view(selected)).toEqual(at("abcd", 2, 4));
    expect(selectedAddressText(selected)).toBe("cd");
    expect(view(press(selected, key("ArrowLeft")))).toEqual(at("abcd", 2));
    expect(view(press(selected, key("ArrowRight")))).toEqual(at("abcd", 4));
    const word = press(
      addressEditOf("foo bar"),
      key("ArrowLeft", {...alt, shift: true}),
    );
    expect(selectedAddressText(word)).toBe("bar");
  });

  it("⌘Z で元に戻し、⌘⇧Z / Ctrl+Y でやり直す。続けて打った文字はまとめて戻る", () => {
    const typed = press(
      addressEditOf("a"),
      key("b"),
      key("c"),
      key("Backspace"),
    );
    expect(typed.text).toBe("ab");
    const undone = press(typed, key("z", meta));
    expect(undone.text).toBe("abc");
    expect(press(undone, key("z", ctrl)).text).toBe("a");
    expect(press(undone, key("z", {...meta, shift: true})).text).toBe("ab");
    expect(press(undone, key("y", ctrl)).text).toBe("ab");
  });

  it("元に戻すものが無い・対象外のキー・⌘C は状態を変えない", () => {
    const state = addressEditOf("abc");
    for (const k of [
      key("z", meta),
      key("c", meta),
      key("x", ctrl),
      key("Tab"),
      key("q", ctrl),
    ]) {
      expect(applyAddressKey(state, k)).toBe(state);
    }
  });
});

describe("applyAddressText", () => {
  it("改行を除いて、カーソルの位置に入れる", () => {
    const edit = press(addressEditOf("af"), key("ArrowLeft"));
    expect(view(applyAddressText(edit, "b\nc\nde"))).toEqual(at("abcdef", 5));
  });

  it("選択中は置き換わる(貼り付け・IME の確定)", () => {
    expect(
      view(applyAddressText(addressEditOf("abc", true), "貼り付け")),
    ).toEqual(at("貼り付け", 4));
  });
});

describe("moveAddressCaret / selectAddressWord", () => {
  it("クリックした位置へカーソルを置き、Shift なら選択を広げる(はみ出さない)", () => {
    const edit = addressEditOf("abcdef");
    expect(view(moveAddressCaret(edit, 2, false))).toEqual(at("abcdef", 2));
    expect(view(moveAddressCaret(edit, 2, true))).toEqual(at("abcdef", 2, 6));
    expect(view(moveAddressCaret(edit, 99, false))).toEqual(at("abcdef", 6));
  });

  it("ダブルクリックでその単語を選ぶ", () => {
    const edit = addressEditOf("https://example.com/path");
    expect(selectedAddressText(selectAddressWord(edit, 10))).toBe("example");
    expect(selectedAddressText(selectAddressWord(edit, 6))).toBe("");
  });
});
