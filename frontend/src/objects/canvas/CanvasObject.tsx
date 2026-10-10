import {useEffect, useMemo} from "react";
import {BoxGeometry, MeshStandardMaterial} from "three";

import {BakeTarget} from "../../bake/BakeTarget";
import {useControlLockWhileWorking} from "../controlLock";
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
 * 作業中(users に誰かいる)の間だけ、紙(絵を描く面。CanvasPaper)が演出のモックとして水色に脈動する。それ以外は真っ白。
 *
 * - AO はベイクだけ(baked。GTAO は掛けない)。キャンバスは動かず、形は固定なので、シーンと一緒に焼ける
 *   (`pnpm bake:ao`。ベイクページも同じ位置でキャンバスを置く)。位置・部品を変えたり、置くキャンバスの数が変わったら再ベイクが要る。
 *   ベイク結果と合わない間は、シーン全体のベイク AO が外れる(BakedAO)
 *   AO の出し方は、置かれたシーンが決める(既定は baked。room のように出し入れするシーンは、影が残らないよう ManagedObjects の ao で realtime にする)
 * - コライダーは持たない。部品の mesh は、コライダーにはせずベイク対象としてだけ登録する(BakeTarget)
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙ってもキャンバスに当たり、アウトラインは全体の外周に 1 本付く
 * - 作業中の間は、プレイヤーの移動・視点を預かる(useControlLockWhileWorking)
 */
export function CanvasObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
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
    <group>
      <BakeTarget>
        {EASEL_PARTS.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i] as BoxGeometry} />
        ))}
        <CanvasPaper active={object.users.length > 0} />
      </BakeTarget>
    </group>
  );
}
