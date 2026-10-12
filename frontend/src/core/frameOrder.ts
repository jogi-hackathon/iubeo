/**
 * useFrame の実行順(昇順)。R3F v9 では priority が正だと自動レンダーが止まるため、更新系は負の値で並べ、
 * 描画を自前で行う PostProcess が正の値を使い、描画の後に戻す処理(warmupRestore)はさらに後ろに置く。
 * 入力消費と身体の更新 → カメラ反映 の順を保証する
 */
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
