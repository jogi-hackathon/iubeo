/**
 * useFrame の実行順(昇順)。R3F v9 では priority が正だと自動レンダーが止まるため、更新系は負の値で並べ、
 * 描画を自前で行う PostProcess だけが正の値を使う。
 * 入力消費と身体の更新 → カメラ反映 の順を保証する
 */
export const FRAME_PRIORITY = {
  player: -2,
  camera: -1,
  /** 描画(ポストプロセス)。正の値なので R3F の自動レンダーの代わりにこちらが描画する */
  render: 1,
} as const;
