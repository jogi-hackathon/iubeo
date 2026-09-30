// テクスチャ AO ベイクの定数とサンプル方向。
// ここを変えるとベイク結果が変わるので、変えたら再ベイクすること。

// ---- 頂点ベイクと揃える定数
export const SAMPLES = 96; // 本ベイクの1テクセルあたりのレイ本数
export const MAX_DIST = 0.6; // これより遠い遮蔽物は数えない(m)
export const BIAS = 0.002; // 自己交差を避けるためのレイ始点のずらし(m)
export const EMBEDDED = 0xffff; // 埋まったテクセルの印

// ---- テクスチャベイク固有の定数
export const TEXEL = 0.02; // 基準テクセル密度(m/テクセル)
export const MIN_TEXELS = 4; // 書類の束の側面などでも最低限確保するテクセル数
export const MAX_TEXELS = 1024;
export const PAD = 1; // アトラス上でチャート間に空ける余白(テクセル)
export const ATLAS_MAX = 8192;
export const CHART_INSET = 0.0005; // チャート内側へ寄せる距離(m)。面ちょうどでの自己交差・埋まりを防ぐ
export const HIDDEN_UV = [0.2, 0.5, 0.8]; // 隠れチャート判定の 3x3 サンプル位置(チャート内側に寄せた格子)
export const HIDDEN_RAYS = 32; // 隠れチャート判定のサンプル点あたりのレイ本数
export const HIDDEN_AO_EPS = 0.02;
export const HIDDEN_TEXELS = 2; // 隠れチャートに縮めるテクセル数(1辺)

export type Dir = { x: number; y: number; z: number };

// 半球上のコサイン重み付きサンプル(z軸が法線方向)
export const hemisphereSamples = (n: number): Dir[] => {
  const dirs: Dir[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = Math.sqrt(u);
    const phi = i * golden;
    dirs.push({
      x: r * Math.cos(phi),
      y: r * Math.sin(phi),
      z: Math.sqrt(1 - u),
    });
  }
  return dirs;
};

export const SAMPLE_DIRS = hemisphereSamples(SAMPLES);
export const HIDDEN_DIRS = hemisphereSamples(HIDDEN_RAYS);

export const rotFor = (seed: number): number =>
  ((seed * 0.6180339887) % 1) * Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
