import {glitchEnvelope} from "../camera/postprocess/glitchState";
import {
  BAND_DENSITY,
  BANDS,
  MAX_SHIFT,
  STEPS_PER_SECOND,
} from "../camera/postprocess/nodes/glitch";

/**
 * 立場が入れかわる瞬間のグリッチ。ゲーム画面のグリッチ(camera/postprocess/nodes/glitch)はキャンバスにしか掛からないので、
 * 同じ帯の数・速さ・密度・ずれ幅・強さの山で、チャット画面(HTML)を帯ごとに横へずらして白黒にする
 */
export interface GlitchSlice {
  /** 画面に対する % */
  top: number;
  height: number;
  /** 横ずれ(画面幅に対する割合) */
  shift: number;
}

/** シェーダーと同じ乱数 */
const rand = (x: number): number => {
  const v = Math.sin(x * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/** グリッチ開始から ms 後に乱れている帯。長さ durationMs を過ぎたら空 */
export const glitchSlicesAt = (
  ms: number,
  durationMs: number,
): GlitchSlice[] => {
  const strength = glitchEnvelope(ms / durationMs);
  if (strength <= 0) {
    return [];
  }
  const tick = Math.floor((ms / 1000) * STEPS_PER_SECOND);
  const slices: GlitchSlice[] = [];
  for (let b = 0; b < BANDS; b++) {
    const band = b + tick * 17;
    if (rand(band) < 1 - strength * BAND_DENSITY) {
      continue;
    }
    slices.push({
      top: (b / BANDS) * 100,
      height: 100 / BANDS,
      shift: (rand(band + 91.7) - 0.5) * MAX_SHIFT * strength,
    });
  }
  return slices;
};
