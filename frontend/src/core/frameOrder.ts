/**
 * useFrame の実行順(昇順)。R3F v9 では priority が正だと自動レンダーが止まるため、負の値で並べる。
 * 入力消費と身体の更新 → カメラ反映 の順を保証する
 */
export const FRAME_PRIORITY = {
  player: -2,
  camera: -1,
} as const;
