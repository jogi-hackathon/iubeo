import {useEffect, useMemo} from "react";
import {BoxGeometry, MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
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
 * - AO は GTAO だけ(realtime。ベイクしない)。core/toggles で出し入れされるので、ベイクすると隠したあとも影が壁・床に残ってしまう
 *   (ベイク対象外の物は、他の面の AO の遮蔽物にもならない)
 * - コライダーは持たない
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙ってもキャンバスに当たり、アウトラインは全体の外周に 1 本付く
 */
export function CanvasObject({object}: {object: GameObject}) {
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
    <group userData={aoModeUserData("realtime")}>
      {EASEL_PARTS.map((part, i) => (
        <Part key={i} part={part} geometry={geometries[i] as BoxGeometry} />
      ))}
      <CanvasPaper active={object.users.length > 0} />
    </group>
  );
}
