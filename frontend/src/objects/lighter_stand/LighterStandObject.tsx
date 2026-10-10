import {BoxGeometry, CylinderGeometry, MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {
  LIGHTER_CASE_PARTS,
  LIGHTER_LID_PART,
  LIGHTER_LID_PIVOT,
  type LighterPart,
  type LighterPartLook,
  type LighterPartShape,
} from "../../items";
import type {GameObject} from "../types";
import {parseLighterStandData} from "./data";
import {STAND_PARTS, STAND_TOP, type StandPartLook} from "./stand";

const CYLINDER_SEGMENTS = 10;

// 部品はみな同じ単位の形を scale で伸ばすので、ジオメトリとマテリアルは種類ごとに 1 つを共有する(机と同じ)。
// 色は机に揃える(台座の下段は骨組みの灰、上段は天板の白、敷物とライターの継ぎ目・蝶番は金物の暗色)
const GEOMETRIES: Record<LighterPartShape, BoxGeometry | CylinderGeometry> = {
  box: new BoxGeometry(1, 1, 1),
  cylinder: new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS),
};
const STAND_MATERIALS: Record<StandPartLook, MeshStandardMaterial> = {
  base: new MeshStandardMaterial({color: "#d8d5cc"}),
  top: new MeshStandardMaterial({color: "#f4f2ec"}),
  pad: new MeshStandardMaterial({color: "#3a3a3a"}),
};
const LIGHTER_MATERIALS: Record<LighterPartLook, MeshStandardMaterial> = {
  body: new MeshStandardMaterial({color: "#fbfaf6"}),
  accent: new MeshStandardMaterial({color: "#3a3a3a"}),
};

function LighterPartMesh({part}: {part: LighterPart}) {
  return (
    <mesh
      geometry={GEOMETRIES[part.shape]}
      material={LIGHTER_MATERIALS[part.look]}
      position={part.position}
      scale={part.scale}
    />
  );
}

/**
 * ライターの置き場: 机の天板に置いた角形の低い台座(寸法は stand.ts)。置き場にライターがある間(data.hasLighter)だけ、
 * 台座の上に Zippo 型のライター(items/lighter。蓋は閉じたまま)を立てる。持ち出すと台座だけになる。
 *
 * - 使えるのは bypassPermission が立った後の生存者だけ(availability。サーバーが決める)。見た目は変えない
 * - 動的に増減するオブジェクトなのでベイクAOの対象外(realtime)。机と同じ
 * - 小物なので、コライダーは持たない
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、台座とライターのどちらを狙っても置き場に当たる
 */
export function LighterStandObject({object}: {object: GameObject}) {
  const {hasLighter} = parseLighterStandData(object.data);
  return (
    <group userData={aoModeUserData("realtime")}>
      {STAND_PARTS.map((part, i) => (
        <mesh
          key={i}
          geometry={GEOMETRIES.box}
          material={STAND_MATERIALS[part.look]}
          position={part.position}
          scale={part.scale}
        />
      ))}
      {hasLighter && (
        <group position={[0, STAND_TOP, 0]}>
          {LIGHTER_CASE_PARTS.map((part, i) => (
            <LighterPartMesh key={i} part={part} />
          ))}
          {/* 蓋は閉じたまま(回さない)。蝶番の位置からの相対で置く */}
          <group position={LIGHTER_LID_PIVOT}>
            <LighterPartMesh part={LIGHTER_LID_PART} />
          </group>
        </group>
      )}
    </group>
  );
}
