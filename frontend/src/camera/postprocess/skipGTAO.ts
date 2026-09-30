import type { Material } from "three";

/**
 * GTAO を掛けないマテリアルの目印(マテリアル直下のプロパティ名)。
 * true のマテリアルには GTAO を掛けず、マテリアル自身の AO(ベイク AO の aoMap)だけを使う。
 *
 * userData ではなくマテリアル直下に置くのは、three が userData をシェーダのキャッシュキーから除外するため
 * (RenderObject.getMaterialCacheKey が userData / name / is* / _* などを飛ばす)。
 * userData だと、色だけ違う baked と both のマテリアルが同じシェーダを共有して片方のモードが逆になり、
 * 同じマテリアルで値を変えても再コンパイルされない。own の enumerable プロパティならキーに値(true / false)が入る。
 * キーはプロパティ名を含まず値を並べるだけなので、貼るマテリアルには true / false を必ず明示する
 */
const KEY = "skipGTAO";

type Flagged = Material & { [KEY]?: boolean };

export const isSkipGTAO = (material: object): boolean =>
  (material as { [KEY]?: unknown })[KEY] === true;

/** value が undefined なら目印ごと外す(元々無かったマテリアルを元に戻す用)。変えたら material.needsUpdate = true にする */
export const setSkipGTAO = (
  material: Material,
  value: boolean | undefined,
): void => {
  if (value === undefined) delete (material as Flagged)[KEY];
  else (material as Flagged)[KEY] = value;
};

/** 現在の値(未設定なら undefined)。setSkipGTAO で元に戻すために控える */
export const getSkipGTAO = (material: Material): boolean | undefined =>
  (material as Flagged)[KEY];
