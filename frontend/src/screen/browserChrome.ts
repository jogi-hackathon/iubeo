import {currentSearchToken} from "./wispUrl";

export const SCREEN_CANVAS = {width: 960, height: 720} as const;

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

export const removeLastChar = (text: string): string =>
  Array.from(text).slice(0, -1).join("");

export type AddressEdit = {text: string; selectAll: boolean};

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

export const applyAddressText = (
  edit: AddressEdit,
  text: string,
): AddressEdit => ({
  text: (edit.selectAll ? "" : edit.text) + text.replace(/[\r\n]+/g, ""),
  selectAll: false,
});
