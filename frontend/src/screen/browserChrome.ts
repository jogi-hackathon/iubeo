/** 画面（合成 canvas）の大きさ。ブラウン管と同じ 4:3 */
export const SCREEN_CANVAS = {width: 960, height: 720} as const;

/** 上の枠の高さ。この下がエンジンの表示 */
export const TOOLBAR_HEIGHT = 56;

/** エンジンの表示の大きさ（画面から枠の分を引いたもの） */
export const CONTENT_HEIGHT = SCREEN_CANVAS.height - TOOLBAR_HEIGHT;

export type ToolbarPart = "back" | "forward" | "address";

type Rect = {x: number; y: number; width: number; height: number};

export const TOOLBAR_LAYOUT: Record<ToolbarPart, Rect> = {
  back: {x: 12, y: 10, width: 40, height: 36},
  forward: {x: 58, y: 10, width: 40, height: 36},
  address: {x: 110, y: 10, width: SCREEN_CANVAS.width - 110 - 12, height: 36},
};

/** 枠の上の点が、どの部品に当たるか。枠の外（エンジンの表示）なら null */
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

/**
 * アドレス欄とスタートページが使う検索。
 * Google は共有の出口 IP（Cloudflare のコンテナ）からの通信に reCAPTCHA を出すので、
 * 本番では WISP を EC2 の Elastic IP 経由にしている（worker/wisp.ts）。その経路が
 * 生きている限り Google が使える。ダメなときはアドレス欄に
 * lite.duckduckgo.com と打てば DuckDuckGo lite が使える
 */
export const SEARCH_PAGE_URL = "https://www.google.com/search";

/** 検索語を、検索結果ページの URL にする */
export const searchUrlFor = (query: string): string =>
  `${SEARCH_PAGE_URL}?q=${encodeURIComponent(query)}`;

const SEARCH_RESULTS_PAGES: ReadonlyArray<(url: URL) => boolean> = [
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
];

export const isSearchResultsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return SEARCH_RESULTS_PAGES.some((test) => test(parsed));
  } catch {
    return false;
  }
};

/**
 * アドレス欄に入った文字を、移動先の URL にする。スキームがあればそのまま、ドメインらしければ https、
 * それ以外は検索にする。空なら null（何もしない）
 */
export const normalizeAddress = (input: string): string | null => {
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
  return searchUrlFor(value);
};

/** 枠に表示する URL。最初のページ（data: の検索画面）は about:home と出す */
export const displayUrl = (url: string): string =>
  url.startsWith("data:") ? "about:home" : url;

/** アドレス欄の編集の初期値。最初のページなら空にして、打ち始めやすくする */
export const addressDraftFor = (url: string): string =>
  url.startsWith("data:") ? "" : url;

/** 末尾の 1 文字（コードポイント）を消す */
export const removeLastChar = (text: string): string =>
  Array.from(text).slice(0, -1).join("");

/**
 * アドレス欄の編集状態。selectAll は「入力全体が選ばれている」こと。次の 1 文字や消去で
 * 全体が置き換わる（実ブラウザの ⌘A と同じ）
 */
export type AddressEdit = {text: string; selectAll: boolean};

/**
 * アドレス欄の編集中のキー入力を編集状態へ反映する。Enter / Escape はここでは捌かない
 * （移動・取り消しは呼び出し側）。
 * ⌘A / Ctrl+A は全選択、⌘⌫ / Ctrl+Backspace は全消去。カーソルは末尾にしか置けないので、
 * Delete 単体では消えない（全選択中か修飾付きのときだけ消す）
 */
export const applyAddressKey = (
  edit: AddressEdit,
  event: {
    key: string;
    charCode: number;
    modifiers: {ctrl: boolean; meta: boolean};
  },
): AddressEdit => {
  const command = event.modifiers.ctrl || event.modifiers.meta;
  if (command && event.key.toLowerCase() === "a") {
    return {text: edit.text, selectAll: edit.text !== ""};
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    if (command || edit.selectAll) {
      return {text: "", selectAll: false};
    }
    return {
      text: event.key === "Backspace" ? removeLastChar(edit.text) : edit.text,
      selectAll: false,
    };
  }
  if (event.charCode >= 0x20) {
    const char = String.fromCodePoint(event.charCode);
    return {text: edit.selectAll ? char : edit.text + char, selectAll: false};
  }
  return edit;
};

/**
 * アドレス欄への文字列入力（IME の確定・貼り付け）。改行は入らず、全選択中は置き換わる
 */
export const applyAddressText = (
  edit: AddressEdit,
  text: string,
): AddressEdit => ({
  text: (edit.selectAll ? "" : edit.text) + text.replace(/[\r\n]+/g, ""),
  selectAll: false,
});
