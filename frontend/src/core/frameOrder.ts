/**
 * R3F v9 は priority が正の購読があると自動レンダーを止める
 */
export const FRAME_PRIORITY = {
  player: -2,
  camera: -1,
  skeleton: 0,
  interact: 0,
  warmup: 0,
  sea: 0,
  render: 1,
} as const;
