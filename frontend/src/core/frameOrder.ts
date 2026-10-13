// R3F v9 では useFrame の priority が正だと自動レンダーが止まるので、正の値は描画を自前で行う PostProcess とその後ろだけに使う
export const FRAME_PRIORITY = {
  player: -2,
  camera: -1,
  skeleton: 0,
  interact: 0,
  warmup: 0,
  sea: 0,
  render: 1,
  warmupRestore: 2,
} as const;
