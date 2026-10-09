import type {JudgeRequest} from "./types";

/**
 * 判定の依頼 (JudgeRequest) の上限と検証。画面 (送る前) と Worker (受けた後) の両方が使う。
 *
 * /judge は Workers AI を呼ぶ (従量課金) ので、入力の大きさはここで必ず抑える。
 * 画面は本文をそのまま読む (BrowserScreen.readPage) ので、送る前に切り詰めて通信も小さくする。
 * Worker は画面を信用せず、同じ検証をもう一度掛ける。
 */

/** お題の上限 (文字)。プリセットは短い語。`?task=` で長い文字列を入れられても Clef に渡す量は増やさない */
export const MAX_TASK = 80;
/** URL の上限 (文字) */
export const MAX_PAGE_URL = 2048;
/** 判定に渡す本文とタイトルの上限 (文字)。長いページでも入力と通信を抑える */
export const MAX_PAGE_TEXT = 2000;
export const MAX_PAGE_TITLE = 200;
/**
 * /judge が受ける本文の上限 (byte)。上の上限まで切り詰めた依頼 (日本語の本文 2000 字で 6KB 程度) が
 * 十分入る大きさにする
 */
export const MAX_JUDGE_BODY_BYTES = 16 * 1024;

/** 文字列を上限まで切り詰める (改行は空白に畳む) */
export const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
};

/** 判定できるのは http(s) のページだけ (data: やスタートページは見ない) */
const isWebUrl = (url: string): boolean => {
  try {
    const {protocol} = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * 判定の依頼を検証し、各項目を上限まで切り詰める。形が違う・お題が空・URL が http(s) でなければ null
 */
export const normalizeJudgeRequest = (value: unknown): JudgeRequest | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const {task, page} = value as Record<string, unknown>;
  if (typeof task !== "string" || !page || typeof page !== "object") {
    return null;
  }
  const {url, title, text} = page as Record<string, unknown>;
  if (
    typeof url !== "string" ||
    typeof title !== "string" ||
    typeof text !== "string"
  ) {
    return null;
  }
  const clippedTask = clip(task, MAX_TASK);
  if (!clippedTask || url.length > MAX_PAGE_URL || !isWebUrl(url)) {
    return null;
  }
  return {
    task: clippedTask,
    page: {
      url,
      title: clip(title, MAX_PAGE_TITLE),
      text: clip(text, MAX_PAGE_TEXT),
    },
  };
};
