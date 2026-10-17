const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** 経過時間に応じて打ち込み終えた文字列。delayMs までは空、以降 msPerChar ごとに 1 文字ずつ増える */
export const typedText = (
  text: string,
  elapsedMs: number,
  msPerChar: number,
  delayMs = 0,
): string => {
  const chars = Array.from(text);
  const n = Math.floor((elapsedMs - delayMs) / msPerChar);
  return chars.slice(0, Math.max(0, Math.min(chars.length, n))).join("");
};

/** 0..1 の進み具合。delay から duration かけて 0 → 1 */
export const progress = (
  elapsedMs: number,
  delayMs: number,
  durationMs: number,
): number => clamp01((elapsedMs - delayMs) / durationMs);

interface LidKey {
  ms: number;
  /** まぶたの開き。1 で画面の高さぶん、それより大きいと画面の隅まで開く */
  open: number;
  /** 寝ぼけ眼のぼかし(px) */
  blur: number;
}

/** 目を開ける動き: 薄く開く → 閉じる → 少し開く → 閉じかける → ゆっくり開ききる */
export const LID_KEYS: readonly LidKey[] = [
  {ms: 0, open: 0, blur: 18},
  {ms: 600, open: 0.12, blur: 18},
  {ms: 900, open: 0, blur: 16},
  {ms: 1400, open: 0.35, blur: 13},
  {ms: 1650, open: 0.08, blur: 11},
  {ms: 2400, open: 0.9, blur: 6},
  {ms: 3600, open: 2.4, blur: 0},
];

/** 目を閉じる動き: 重くなって下がり、一度こらえて少し開き、そのまま閉じる */
export const CLOSE_LID_KEYS: readonly LidKey[] = [
  {ms: 0, open: 2.4, blur: 0},
  {ms: 900, open: 0.9, blur: 3},
  {ms: 1500, open: 0.45, blur: 6},
  {ms: 1850, open: 0.65, blur: 7},
  {ms: 2500, open: 0.15, blur: 11},
  {ms: 3000, open: 0, blur: 14},
];

export const LOGO_FADE_OUT_MS = 1000;
const LOGO_BLACK_MS = 1000;

export const LOGO_TURN_MS = LOGO_FADE_OUT_MS + LOGO_BLACK_MS;

export const logoFadeOutAt = (elapsedMs: number): number =>
  1 - progress(elapsedMs, 0, LOGO_FADE_OUT_MS);

export const durationOf = (keys: readonly LidKey[]): number =>
  keys[keys.length - 1]!.ms;

export const LID_DURATION_MS = durationOf(LID_KEYS);
export const CLOSE_LID_DURATION_MS = durationOf(CLOSE_LID_KEYS);

export const lidAt = (
  ms: number,
  keys: readonly LidKey[] = LID_KEYS,
): {open: number; blur: number} => {
  const first = keys[0]!;
  if (ms <= first.ms) {
    return {open: first.open, blur: first.blur};
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (ms <= b.ms) {
      const t = smoothstep((ms - a.ms) / (b.ms - a.ms));
      return {
        open: a.open + (b.open - a.open) * t,
        blur: a.blur + (b.blur - a.blur) * t,
      };
    }
  }
  const last = keys[keys.length - 1]!;
  return {open: last.open, blur: last.blur};
};
