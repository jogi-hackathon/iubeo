// アトラスの配置(potpack)・チャート内 dilate・アトラスへの書き込み。
import potpack from "potpack";

import {texelsFor} from "./charts";
import {ATLAS_MAX, clamp, HIDDEN_TEXELS, PAD} from "./params";

// ---------------------------------------------------------------- 型

/** アトラス上のチャート内側矩形(PAD を含まない) */
export type AtlasRect = {x: number; y: number; w: number; h: number};
/** チャートのテクセル数 */
export type AtlasSize = {w: number; h: number};

export type PackedAtlas = {
  atlasW: number;
  atlasH: number;
  /** アトラスの空間利用率(0..1) */
  fill: number;
  rects: AtlasRect[];
  sizes: AtlasSize[];
  texelTotal: number;
};

// ---------------------------------------------------------------- 配置

// テクセル数を決定して potpack でアトラスに詰める(PAD 込みの矩形で詰め、内側矩形を控える)
export const packAtlas = (
  chartCount: number,
  hiddenFlags: ArrayLike<number>,
  widths: ArrayLike<number>,
  heights: ArrayLike<number>,
): PackedAtlas => {
  const boxes: {
    w: number;
    h: number;
    x?: number;
    y?: number;
    chart: number;
    innerW: number;
    innerH: number;
  }[] = [];
  for (let c = 0; c < chartCount; c++) {
    const w = hiddenFlags[c] ? HIDDEN_TEXELS : texelsFor(widths[c] ?? 0);
    const h = hiddenFlags[c] ? HIDDEN_TEXELS : texelsFor(heights[c] ?? 0);
    boxes.push({
      w: w + PAD * 2,
      h: h + PAD * 2,
      chart: c,
      innerW: w,
      innerH: h,
    });
  }
  const packStats = potpack(boxes);
  const atlasW = Math.ceil(packStats.w);
  const atlasH = Math.ceil(packStats.h);
  if (atlasW > ATLAS_MAX || atlasH > ATLAS_MAX) {
    throw new Error(
      `[bake] アトラスサイズが上限を超えました: ${atlasW}x${atlasH} > ${ATLAS_MAX}`,
    );
  }

  const rects: AtlasRect[] = Array.from({length: chartCount});
  const sizes: AtlasSize[] = Array.from({length: chartCount});
  let texelTotal = 0;
  for (const b of boxes) {
    // potpack が x / y を書き込む(型上は optional)
    rects[b.chart] = {
      x: (b.x ?? 0) + PAD,
      y: (b.y ?? 0) + PAD,
      w: b.innerW,
      h: b.innerH,
    };
    sizes[b.chart] = {w: b.innerW, h: b.innerH};
    texelTotal += b.innerW * b.innerH;
  }
  return {atlasW, atlasH, fill: packStats.fill, rects, sizes, texelTotal};
};

// ---------------------------------------------------------------- dilate

// 同じチャート内の有効な隣接テクセル(8近傍)の平均で無効テクセルを反復して埋める。
// raw は 0..255、無効は負値(-1)
export const dilateChart = (
  raw: ArrayLike<number>,
  w: number,
  h: number,
): Uint8Array => {
  const values = new Uint8Array(w * h);
  const valid = new Uint8Array(w * h);
  let remaining = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] ?? -1;
    if (r >= 0) {
      values[i] = r;
      valid[i] = 1;
    } else {
      remaining++;
    }
  }
  for (let pass = 0; pass < 64 && remaining > 0; pass++) {
    const sum = new Float32Array(w * h);
    const cnt = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (valid[i]) {
          continue;
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
              continue;
            }
            const ni = ny * w + nx;
            if (!valid[ni]) {
              continue;
            }
            sum[i] = (sum[i] ?? 0) + (values[ni] ?? 0);
            cnt[i] = (cnt[i] ?? 0) + 1;
          }
        }
      }
    }
    let changed = false;
    for (let i = 0; i < w * h; i++) {
      const c = cnt[i] ?? 0;
      if (valid[i] || c === 0) {
        continue;
      }
      values[i] = Math.round((sum[i] ?? 0) / c);
      valid[i] = 1;
      remaining--;
      changed = true;
    }
    if (!changed) {
      break;
    }
  }
  if (remaining > 0) {
    // 同じチャート内に有効なテクセルが1つもつながらない(チャート全体が無効)場合は暗くしておく
    for (let i = 0; i < w * h; i++) {
      if (!valid[i]) {
        values[i] = 0;
      }
    }
  }
  return values;
};

// ---------------------------------------------------------------- 書き込み

// チャートの値を PAD 込みでアトラスに書く(PAD はチャート端のテクセルを引き伸ばす)
export const writeChartToAtlas = (
  atlas: Uint8Array,
  atlasW: number,
  atlasH: number,
  rect: AtlasRect,
  w: number,
  h: number,
  values: ArrayLike<number>,
): void => {
  for (let py = -PAD; py < h + PAD; py++) {
    const ay = rect.y + py;
    if (ay < 0 || ay >= atlasH) {
      continue;
    }
    const sy = clamp(py, 0, h - 1);
    const rowOff = ay * atlasW;
    const srcRow = sy * w;
    for (let px = -PAD; px < w + PAD; px++) {
      const ax = rect.x + px;
      if (ax < 0 || ax >= atlasW) {
        continue;
      }
      const sx = clamp(px, 0, w - 1);
      atlas[rowOff + ax] = values[srcRow + sx] ?? 0;
    }
  }
};
