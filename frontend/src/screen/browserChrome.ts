/**
 * PC の画面に出すブラウザの枠（戻る・進む・アドレスバー）のレイアウトと、入力の振り分け。
 *
 * 枠は HUD ではなく、画面の中（テクスチャ）に描く。普通のブラウザと同じく、上の帯が枠で、
 * その下がエンジンの表示。座標はすべて画面の合成 canvas の画素（原点は左上）。
 */

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
 * アドレス欄に入った文字を、移動先の URL にする。スキームがあればそのまま、ドメインらしければ https、
 * それ以外は Google の検索にする。空なら null（何もしない）
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
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
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
