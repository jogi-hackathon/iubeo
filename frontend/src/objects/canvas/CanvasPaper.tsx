import {useEffect, useMemo} from "react";
import {BoxGeometry, MeshStandardMaterial, type Texture} from "three";

import {PAPER_PLACEMENT} from "./easel";

/**
 * キャンバスの紙(絵を描く面)。表示内容は texture で差し替える。null なら真っ白な紙。
 * 画像そのものではなく、拡散モデルのように絵ができあがっていく演出(筆を重ねる、飛沫が重なるなど)を載せる場所なので、
 * 描く側(Canvas2D で描き足す CanvasTexture など)がテクスチャを更新し、ここはそれを貼るだけにする。
 *
 * - テクスチャは、呼び出し側が持ち、破棄も呼び出し側が行う(ここでは dispose しない)。縦横比は PAPER_SIZE。
 *   色のテクスチャなら colorSpace は SRGBColorSpace にしておく。中身を描き換えたら、呼び出し側が needsUpdate を立てる
 * - ベイク対象(baked)なので、CanvasObject の BakeTarget の配下に、常に置く(後から足した mesh はベイク対象にならない)。
 *   テクスチャの有無で mesh を出し入れせず、material.map だけを切り替える
 * - ジオメトリ・マテリアルはキャンバスごとに持つ(uv1・aoMap が、それぞれに付くため)
 */
export function CanvasPaper({texture = null}: {texture?: Texture | null}) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(
    () => new MeshStandardMaterial({color: "#ffffff"}),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    // map の有無でシェーダーが変わるので、切り替わったときだけ再コンパイルする
    const changed = !material.map !== !texture;
    material.map = texture;
    if (changed) {
      material.needsUpdate = true;
    }
  }, [material, texture]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={PAPER_PLACEMENT.position}
      scale={PAPER_PLACEMENT.scale}
      {...(PAPER_PLACEMENT.rotation && {rotation: PAPER_PLACEMENT.rotation})}
    />
  );
}
