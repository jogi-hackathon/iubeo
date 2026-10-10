import {useEffect, useRef} from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  type Group,
  MeshStandardMaterial,
} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {addPowerOutline} from "../../camera/postprocess/powerOutlineSelection";
import {
  LIGHTER_CASE_PARTS,
  LIGHTER_FOOTPRINT,
  LIGHTER_HEIGHT,
  LIGHTER_LID_PART,
  LIGHTER_LID_PIVOT,
  type LighterPart,
  type LighterPartLook,
  type LighterPartShape,
} from "../../items";
import type {GameObject} from "../types";
import {parseLighterStandData} from "./data";
import {HIT_SIZE, LIGHTER_REST, MARK_COLOR, MARK_HEIGHT} from "./stand";

const CYLINDER_SEGMENTS = 10;

const GEOMETRIES: Record<LighterPartShape, BoxGeometry | CylinderGeometry> = {
  box: new BoxGeometry(1, 1, 1),
  cylinder: new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS),
};
const LIGHTER_MATERIALS: Record<LighterPartLook, MeshStandardMaterial> = {
  body: new MeshStandardMaterial({color: "#fbfaf6"}),
  accent: new MeshStandardMaterial({color: "#3a3a3a"}),
};
const MARK_MATERIAL = new MeshStandardMaterial({color: MARK_COLOR});

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

function RestingLighter() {
  return (
    <group position={[0, LIGHTER_FOOTPRINT[1] / 2, 0]}>
      <group
        position={[0, 0, LIGHTER_HEIGHT / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {LIGHTER_CASE_PARTS.map((part, i) => (
          <LighterPartMesh key={i} part={part} />
        ))}
        <group position={LIGHTER_LID_PIVOT}>
          <LighterPartMesh part={LIGHTER_LID_PART} />
        </group>
      </group>
    </group>
  );
}

/**
 * ライターの置き場: 机の天板の上(寸法と置き方は stand.ts)。台座は持たない。
 * 置き場にライターがある間(data.hasLighter)は、Zippo 型のライター(items/lighter)を正面を上にして寝かせ、斜めに無造作に置く(LIGHTER_REST)。
 * 持ち出した後は、同じ場所・同じ向きに、ライターの形の跡(天板より一段暗い薄板)を残す。跡は見えるので、狙うと縁取られ、戻す場所が分かる。
 *
 * - 狙いは、置いた場所の周りの見えない箱(HIT_SIZE)で受ける。寝かせたライターは薄くて狙いにくいため。
 *   見えない mesh もレイキャストには当たるが、描画とアウトラインには出ない(縁取られるのは、ライターか跡)
 * - 使えるのは bypassPermission が立った後の生存者だけ(availability。サーバーが決める)。使える間は、置いてあるライターに
 *   赤く波打つ太めの縁取り(ポストプロセスの力の縁取り。camera/postprocess/powerOutlineSelection)を付けて、
 *   強大な力を持ったアイテムになったことを見せる。狙いの縁取りと同じ、画面上で外周を描く仕組み。
 *   サーバーは bypassPermission が立つと置き場を available にする(ローカルの規則も同じ)ので、availability をその合図に使う
 * - 動的に増減するオブジェクトなのでベイクAOの対象外(realtime)。机と同じ
 * - 小物なので、コライダーは持たない
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、当たり判定・ライター・跡のどれに当たっても置き場に当たる
 */
export function LighterStandObject({object}: {object: GameObject}) {
  const {hasLighter} = parseLighterStandData(object.data);
  const empowered = hasLighter && object.availability === "available";
  const lighter = useRef<Group>(null);
  useEffect(() => {
    const g = lighter.current;
    if (!empowered || !g) {
      return;
    }
    return addPowerOutline(g);
  }, [empowered]);
  return (
    <group userData={aoModeUserData("realtime")}>
      <mesh
        geometry={GEOMETRIES.box}
        position={[0, HIT_SIZE[1] / 2, 0]}
        scale={HIT_SIZE}
        visible={false}
      />
      <group
        ref={lighter}
        position={[LIGHTER_REST.x, 0, LIGHTER_REST.z]}
        rotation={[0, LIGHTER_REST.yaw, 0]}
      >
        {hasLighter ? (
          <RestingLighter />
        ) : (
          <mesh
            geometry={GEOMETRIES.box}
            material={MARK_MATERIAL}
            position={[0, MARK_HEIGHT / 2, 0]}
            scale={[LIGHTER_FOOTPRINT[0], MARK_HEIGHT, LIGHTER_HEIGHT]}
          />
        )}
      </group>
    </group>
  );
}
