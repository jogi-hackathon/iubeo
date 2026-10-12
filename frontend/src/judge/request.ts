import type {JudgeRequest} from "./types";

export const MAX_TASK = 80;
export const MAX_PAGE_URL = 2048;
export const MAX_PAGE_TEXT = 2000;
export const MAX_PAGE_TITLE = 200;
export const MAX_JUDGE_BODY_BYTES = 16 * 1024;

export const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
};

const isWebUrl = (url: string): boolean => {
  try {
    const {protocol} = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

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
