import {SCREEN_CANVAS} from "../../display/resolution";
import {currentSearchToken} from "./wispUrl";

export const TOOLBAR_HEIGHT = 56;

export const CONTENT_HEIGHT = SCREEN_CANVAS.height - TOOLBAR_HEIGHT;

export type ToolbarPart = "back" | "forward" | "address";

type Rect = {x: number; y: number; width: number; height: number};

export const TOOLBAR_LAYOUT: Record<ToolbarPart, Rect> = {
  back: {x: 12, y: 10, width: 40, height: 36},
  forward: {x: 58, y: 10, width: 40, height: 36},
  address: {x: 110, y: 10, width: SCREEN_CANVAS.width - 110 - 12, height: 36},
};

export const hitToolbar = (x: number, y: number): ToolbarPart | null => {
  if (y < 0 || y >= TOOLBAR_HEIGHT) {
    return null;
  }
  for (const part of ["back", "forward", "address"] as const) {
    const r = TOOLBAR_LAYOUT[part];
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
      return part;
    }
  }
  return null;
};

export const SEARCH_PAGE_PATH = "/api/v1/search/page";

export const currentOrigin = (): string => globalThis.location?.origin ?? "";

export const searchPageUrl = (origin = currentOrigin()): string =>
  `${origin}${SEARCH_PAGE_PATH}`;

export const searchUrlFor = (
  query: string,
  origin = currentOrigin(),
  token = currentSearchToken(),
): string => {
  const tokenParam = token ? `&t=${encodeURIComponent(token)}` : "";
  return `${searchPageUrl(origin)}?q=${encodeURIComponent(query)}${tokenParam}`;
};

const SEARCH_RESULTS_PAGES: ReadonlyArray<(url: URL) => boolean> = [
  (url) => url.pathname === SEARCH_PAGE_PATH,
  (url) =>
    /(^|\.)google\.[a-z.]+$/.test(url.hostname) &&
    url.pathname.startsWith("/search"),
  (url) =>
    /(^|\.)duckduckgo\.com$/.test(url.hostname) &&
    (url.searchParams.has("q") || /^\/(lite|html)\/?$/.test(url.pathname)),
  (url) =>
    /(^|\.)bing\.com$/.test(url.hostname) && url.pathname.startsWith("/search"),
  (url) =>
    url.hostname === "search.brave.com" && url.pathname.startsWith("/search"),
  (url) =>
    /(^|\.)ecosia\.org$/.test(url.hostname) &&
    url.pathname.startsWith("/search"),
  (url) =>
    url.hostname === "search.yahoo.co.jp" && url.pathname.endsWith("/search"),
];

export const isSearchResultsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return SEARCH_RESULTS_PAGES.some((test) => test(parsed));
  } catch {
    return false;
  }
};

export const normalizeAddress = (
  input: string,
  origin = currentOrigin(),
  token = currentSearchToken(),
): string | null => {
  const value = input.trim();
  if (!value) {
    return null;
  }
  if (/^(https?|data|about|file):/i.test(value)) {
    return value;
  }
  const looksLikeHost =
    /^[^\s/]+\.[^\s/]+/.test(value) || /^localhost(:\d+)?(\/|$)/i.test(value);
  if (!/\s/.test(value) && looksLikeHost) {
    return `https://${value}`;
  }
  return searchUrlFor(value, origin, token);
};

export const displayUrl = (url: string): string =>
  url.startsWith("data:") ? "about:home" : url;

export const addressDraftFor = (url: string): string =>
  url.startsWith("data:") ? "" : url;

/** アドレス欄の中身。位置は文字(コードポイント)の数で数え、caret と anchor の間が選択範囲 */
type AddressSnapshot = {text: string; caret: number; anchor: number};

export type AddressEdit = AddressSnapshot & {
  undo: readonly AddressSnapshot[];
  redo: readonly AddressSnapshot[];
  /** 直前の操作が文字の入力か。続けて打った文字は、元に戻すときにまとめて消す */
  typing: boolean;
};

const UNDO_LIMIT = 100;

export const addressEditOf = (text: string, selectAll = false): AddressEdit => {
  const length = Array.from(text).length;
  return {
    text,
    caret: length,
    anchor: selectAll ? 0 : length,
    undo: [],
    redo: [],
    typing: false,
  };
};

export const addressSelection = (
  edit: AddressEdit,
): {start: number; end: number} => ({
  start: Math.min(edit.caret, edit.anchor),
  end: Math.max(edit.caret, edit.anchor),
});

export const selectedAddressText = (edit: AddressEdit): string => {
  const {start, end} = addressSelection(edit);
  return Array.from(edit.text).slice(start, end).join("");
};

const snapshot = ({text, caret, anchor}: AddressEdit): AddressSnapshot => ({
  text,
  caret,
  anchor,
});

const moveTo = (
  edit: AddressEdit,
  caret: number,
  extend: boolean,
): AddressEdit => {
  const anchor = extend ? edit.anchor : caret;
  if (caret === edit.caret && anchor === edit.anchor) {
    return edit;
  }
  return {...edit, caret, anchor, typing: false};
};

/** start から end までを insert に置き換える。元に戻せるよう、前の状態を積む */
const replaceRange = (
  edit: AddressEdit,
  start: number,
  end: number,
  insert: string,
  typing = false,
): AddressEdit => {
  const chars = Array.from(edit.text);
  const inserted = Array.from(insert);
  if (start === end && inserted.length === 0) {
    return edit;
  }
  const text = [
    ...chars.slice(0, start),
    ...inserted,
    ...chars.slice(end),
  ].join("");
  const caret = start + inserted.length;
  const merge = typing && edit.typing && start === end;
  return {
    text,
    caret,
    anchor: caret,
    undo: merge ? edit.undo : [...edit.undo, snapshot(edit)].slice(-UNDO_LIMIT),
    redo: [],
    typing,
  };
};

const replaceSelection = (
  edit: AddressEdit,
  insert: string,
  typing = false,
) => {
  const {start, end} = addressSelection(edit);
  return replaceRange(edit, start, end, insert, typing);
};

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}_]/u.test(char);

/** 左の単語の頭。単語のすき間(記号・空白)を飛ばしてから、単語の頭まで進む */
const wordStart = (chars: string[], from: number): number => {
  let i = from;
  while (i > 0 && !isWordChar(chars[i - 1])) {
    i -= 1;
  }
  while (i > 0 && isWordChar(chars[i - 1])) {
    i -= 1;
  }
  return i;
};

const wordEnd = (chars: string[], from: number): number => {
  let i = from;
  while (i < chars.length && !isWordChar(chars[i])) {
    i += 1;
  }
  while (i < chars.length && isWordChar(chars[i])) {
    i += 1;
  }
  return i;
};

/** caret の位置の単語を選ぶ(ダブルクリック) */
export const selectAddressWord = (
  edit: AddressEdit,
  at: number,
): AddressEdit => {
  const chars = Array.from(edit.text);
  if (!isWordChar(chars[at]) && !isWordChar(chars[at - 1])) {
    return moveTo(edit, at, false);
  }
  const start = isWordChar(chars[at - 1]) ? wordStart(chars, at) : at;
  const end = isWordChar(chars[at]) ? wordEnd(chars, at) : at;
  return {...edit, anchor: start, caret: end, typing: false};
};

export const moveAddressCaret = (
  edit: AddressEdit,
  caret: number,
  extend: boolean,
): AddressEdit =>
  moveTo(
    edit,
    Math.max(0, Math.min(Array.from(edit.text).length, caret)),
    extend,
  );

const undo = (edit: AddressEdit): AddressEdit => {
  const previous = edit.undo.at(-1);
  if (!previous) {
    return edit;
  }
  return {
    ...previous,
    undo: edit.undo.slice(0, -1),
    redo: [...edit.redo, snapshot(edit)],
    typing: false,
  };
};

const redo = (edit: AddressEdit): AddressEdit => {
  const next = edit.redo.at(-1);
  if (!next) {
    return edit;
  }
  return {
    ...next,
    undo: [...edit.undo, snapshot(edit)],
    redo: edit.redo.slice(0, -1),
    typing: false,
  };
};

/**
 * アドレス欄のキー操作。Mac と Windows の定番のショートカットをどちらも受ける。
 *  - ⌘/Ctrl+A 全選択、⌘/Ctrl+X 切り取り(選択を消す。クリップボードへは呼び出し側が書く)
 *  - ⌘/Ctrl+Z 元に戻す、⌘/Ctrl+Shift+Z と Ctrl+Y やり直す
 *  - ←→ 1 文字、Option/Ctrl+←→ 1 単語、⌘←→・Home/End・↑↓ 行の端へ。Shift を足すと選択を広げる
 *  - Backspace/Delete 1 文字、Option/Ctrl 付きで 1 単語、⌘ 付きで行の端まで消す
 */
export const applyAddressKey = (
  edit: AddressEdit,
  event: {
    key: string;
    charCode: number;
    modifiers: {ctrl: boolean; meta: boolean; alt?: boolean; shift?: boolean};
  },
): AddressEdit => {
  const {ctrl, meta} = event.modifiers;
  const alt = event.modifiers.alt ?? false;
  const shift = event.modifiers.shift ?? false;
  const command = ctrl || meta;
  const chars = Array.from(edit.text);
  const {start, end} = addressSelection(edit);
  const selected = start !== end;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (command && !alt) {
    switch (key) {
      case "a":
        return {...edit, anchor: 0, caret: chars.length, typing: false};
      case "x":
        return replaceSelection(edit, "");
      case "z":
        return shift ? redo(edit) : undo(edit);
      case "y":
        return ctrl ? redo(edit) : edit;
    }
  }

  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight": {
      const left = event.key === "ArrowLeft";
      if (meta) {
        return moveTo(edit, left ? 0 : chars.length, shift);
      }
      if (alt || ctrl) {
        const to = left
          ? wordStart(chars, edit.caret)
          : wordEnd(chars, edit.caret);
        return moveTo(edit, to, shift);
      }
      if (selected && !shift) {
        return moveTo(edit, left ? start : end, false);
      }
      const to = Math.max(
        0,
        Math.min(chars.length, edit.caret + (left ? -1 : 1)),
      );
      return moveTo(edit, to, shift);
    }
    case "Home":
    case "ArrowUp":
      return moveTo(edit, 0, shift);
    case "End":
    case "ArrowDown":
      return moveTo(edit, chars.length, shift);
    case "Backspace":
      if (selected) {
        return replaceSelection(edit, "");
      }
      if (meta) {
        return replaceRange(edit, 0, edit.caret, "");
      }
      if (alt || ctrl) {
        return replaceRange(edit, wordStart(chars, edit.caret), edit.caret, "");
      }
      return replaceRange(edit, Math.max(0, edit.caret - 1), edit.caret, "");
    case "Delete":
      if (selected) {
        return replaceSelection(edit, "");
      }
      if (meta) {
        return replaceRange(edit, edit.caret, chars.length, "");
      }
      if (alt || ctrl) {
        return replaceRange(edit, edit.caret, wordEnd(chars, edit.caret), "");
      }
      return replaceRange(
        edit,
        edit.caret,
        Math.min(chars.length, edit.caret + 1),
        "",
      );
  }

  if (!command && event.charCode >= 0x20) {
    return replaceSelection(edit, String.fromCodePoint(event.charCode), true);
  }
  return edit;
};

/** 貼り付けや IME の確定。選択があれば置き換える(改行は除く) */
export const applyAddressText = (
  edit: AddressEdit,
  text: string,
): AddressEdit => replaceSelection(edit, text.replace(/[\r\n]+/g, ""));
