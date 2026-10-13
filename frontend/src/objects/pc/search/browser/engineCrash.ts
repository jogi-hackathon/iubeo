/**
 * 実例: "Pthread 0x... sent an error! ...: Uncaught RuntimeError: table index is out of bounds"
 */
const CRASH_LINE_PATTERN = /RuntimeError|sent an error!|Aborted\(/;

export const isEngineCrashLine = (line: string): boolean =>
  CRASH_LINE_PATTERN.test(line);

export const isResumablePage = (url: string): boolean =>
  /^https?:\/\//.test(url);

export const CRASH_RESTART_LIMIT = 3;
export const CRASH_RESTART_WINDOW_MS = 60_000;

export type RestartBudget = {allowed: boolean; history: number[]};

export const takeRestartBudget = (
  history: readonly number[],
  now: number,
): RestartBudget => {
  const recent = history.filter((at) => now - at < CRASH_RESTART_WINDOW_MS);
  if (recent.length >= CRASH_RESTART_LIMIT) {
    return {allowed: false, history: recent};
  }
  return {allowed: true, history: [...recent, now]};
};
