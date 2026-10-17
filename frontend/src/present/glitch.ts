import {glitchEnvelope} from "../camera/postprocess/glitchState";

export interface ShiftedBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  shift: number;
}

const LARGE_BLOCK = 44;
const SHIFT_FROM_STRENGTH = 0.1;
const SHIFT_FULL_STRENGTH = 0.8;
const INTENSITY_GAIN = 2.5;
const STEP_RATE = 24;
const STEP_WRAP = 4096;
const MAX_SHIFTED_BLOCKS = 10;
const SHIFT_CHANCE = 0.2;
const HASH_SHIFTED = 100;
const HASH_SHIFT_BLOCKS = 101;
const REVEAL_CELL = 18;
const REVEAL_JITTER_CELLS = 3;
const HASH_REVEAL = 400;

export const glitchPulseAt = (ms: number, durationMs: number): number =>
  glitchEnvelope(ms / durationMs);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

const pcg = (v: number): number => {
  const state = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const word =
    Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>>
    0;
  return ((word >>> 22) ^ word) >>> 0;
};

export const cellHash = (
  cellX: number,
  cellY: number,
  step: number,
  n: number,
): number =>
  pcg(
    (cellX + Math.imul(cellY, 4099) + Math.imul(step, 65537) + n * 7919) >>> 0,
  ) / 4294967296;

export const shiftStepAt = (ms: number): number =>
  Math.floor((Math.max(ms, 0) / 1000) * STEP_RATE) % STEP_WRAP;

export const largeBlockWeightOf = (strength: number): number =>
  smoothstep(SHIFT_FROM_STRENGTH, SHIFT_FULL_STRENGTH, strength);

export const shiftedBlocksAt = (
  step: number,
  strength: number,
  width: number,
  height: number,
): ShiftedBlock[] => {
  const weight = largeBlockWeightOf(strength);
  const limit = Math.ceil(MAX_SHIFTED_BLOCKS * weight);
  if (limit <= 0) {
    return [];
  }
  const chance = weight * (1 + INTENSITY_GAIN * strength) * SHIFT_CHANCE;
  const step4 = Math.floor(step / 4);
  const candidates: {cx: number; cy: number; roll: number}[] = [];
  for (let cy = 0; cy * LARGE_BLOCK < height; cy++) {
    for (let cx = 0; cx * LARGE_BLOCK < width; cx++) {
      const roll = cellHash(cx, cy, step4, HASH_SHIFTED);
      if (roll < chance) {
        candidates.push({cx, cy, roll});
      }
    }
  }
  return candidates
    .sort((a, b) => a.roll - b.roll)
    .slice(0, limit)
    .map(({cx, cy}) => {
      const k = Math.floor(cellHash(cx, cy, step4, HASH_SHIFT_BLOCKS) * 6);
      const blocks = k < 3 ? k - 3 : k - 2;
      return {
        x: cx * LARGE_BLOCK,
        y: cy * LARGE_BLOCK,
        width: LARGE_BLOCK,
        height: LARGE_BLOCK,
        shift: blocks * LARGE_BLOCK,
      };
    });
};

export const revealClipPath = (
  progress: number,
  width: number,
  height: number,
): string => {
  const jitter = REVEAL_JITTER_CELLS * REVEAL_CELL;
  const radius = progress * (Math.hypot(width / 2, height / 2) + jitter);
  const cols = Math.ceil(width / REVEAL_CELL);
  const rows = Math.ceil(height / REVEAL_CELL);
  const runs: string[] = [];
  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let col = 0; col <= cols; col++) {
      const cx = (col + 0.5) * REVEAL_CELL - width / 2;
      const cy = (row + 0.5) * REVEAL_CELL - height / 2;
      const open =
        col < cols &&
        Math.hypot(cx, cy) + cellHash(col, row, 0, HASH_REVEAL) * jitter <
          radius;
      if (open && start < 0) {
        start = col;
      } else if (!open && start >= 0) {
        const x = start * REVEAL_CELL;
        const y = row * REVEAL_CELL;
        runs.push(
          `M${x} ${y}h${(col - start) * REVEAL_CELL}v${REVEAL_CELL}h${-(col - start) * REVEAL_CELL}Z`,
        );
        start = -1;
      }
    }
  }
  return runs.length === 0 ? "inset(50%)" : `path("${runs.join("")}")`;
};
