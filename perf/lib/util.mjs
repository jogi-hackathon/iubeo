// 計測の共通の小物: 引数の解析・統計
export const parseArgs = (argv, defaults) => {
  const out = {...defaults};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (typeof defaults[key] === "boolean") {
      out[key] = true;
    } else {
      out[key] = argv[++i];
    }
  }
  return out;
};

/** 昇順に並んだ配列の百分位(最近傍) */
export const percentile = (sorted, p) => {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
