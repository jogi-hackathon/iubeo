import {useEffect, useMemo} from "react";
import {BoxGeometry, MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {BakeTarget} from "../../bake/BakeTarget";
import type {GameObject} from "../types";
import {CanvasPaper} from "./CanvasPaper";
import {EASEL_PARTS, type EaselLook, type EaselPart} from "./easel";

// マテリアルは種類ごとに 1 つを共有する(ベイク対象だけで使うので、aoMap を貼っても対象外の mesh には影響しない)。
// ジオメトリは部品ごとに持つ(ベイク AO の uv1 はジオメトリに付くので、共有できない)
// IUBEO は色のない真っ白な世界なので、部品の種類は分けつつ、色はどれも真っ白にする
const WHITE = "#ffffff";
const MATERIALS: Record<EaselLook, MeshStandardMaterial> = {
  wood: new MeshStandardMaterial({color: WHITE}),
  accent: new MeshStandardMaterial({color: WHITE}),
};

function Part({part, geometry}: {part: EaselPart; geometry: BoxGeometry}) {
  return (
    <mesh
      geometry={geometry}
      material={MATERIALS[part.look]}
      position={part.position}
      scale={part.scale}
      {...(part.rotation && {rotation: part.rotation})}
    />
  );
}

/**
 * キャンバス: イーゼルに立てかけた絵の面のモック(Image Generation のタスクで使う場所)。寸法と部品の配置は easel.ts。
 * 今は見た目だけで、機能(絵の表示・生成中の演出)は持たない。紙(絵を描く面)は CanvasPaper が別に描く(今は texture なしの真っ白)。
 *
 * - AO はベイクだけ(baked。GTAO は掛けない)。キャンバスは動かず、形は固定なので、シーンと一緒に焼ける
 *   (`pnpm bake:ao`。ベイクページも同じ位置でキャンバスを置く)。位置・部品を変えたり、置くキャンバスの数が変わったら再ベイクが要る。
 *   ベイク結果と合わない間は、シーン全体のベイク AO が外れる(BakedAO)
 * - コライダーは持たない。部品の mesh は、コライダーにはせずベイク対象としてだけ登録する(BakeTarget)
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙ってもキャンバスに当たり、アウトラインは全体の外周に 1 本付く
 */
export function CanvasObject(_props: {object: GameObject}) {
  const geometries = useMemo(
    () => EASEL_PARTS.map(() => new BoxGeometry(1, 1, 1)),
    [],
  );
  useEffect(
    () => () => {
      for (const g of geometries) {
        g.dispose();
      }
    },
    [geometries],
  );

  return (
    <group userData={aoModeUserData("baked")}>
      <BakeTarget>
        {EASEL_PARTS.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i] as BoxGeometry} />
        ))}
        <CanvasPaper />
      </BakeTarget>
    </group>
  );
}
