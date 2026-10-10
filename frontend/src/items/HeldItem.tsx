import {useFrame} from "@react-three/fiber";
import {useRef} from "react";
import {
  BackSide,
  BoxGeometry,
  CylinderGeometry,
  type Group,
  MeshBasicMaterial,
} from "three";

import {setSkipGTAO} from "../camera/postprocess/skipGTAO";
import {FILE_KIND, parseFileData} from "./file";
import {
  heldLighterPose,
  LIGHTER_CASE_PARTS,
  LIGHTER_FLAME_BASE,
  LIGHTER_FLAME_SIZE,
  LIGHTER_HELD_CENTER_Y,
  LIGHTER_HELD_OUTLINE,
  LIGHTER_HELD_SCALE,
  LIGHTER_INSERT_PARTS,
  LIGHTER_KIND,
  LIGHTER_LID_PART,
  LIGHTER_LID_PIVOT,
  type LighterPart,
  type LighterPartLook,
  type LighterPartShape,
} from "./lighter";
import {
  FLAME_GEOMETRY,
  FLAME_MATERIAL,
  FLAME_OUTLINE_MATERIAL,
} from "./lighterFlame";
import type {Item} from "./types";

const FILL_MATERIAL = new MeshBasicMaterial({color: "#ffffff"});
const OUTLINE_COLOR = "#1a1a1a";
const OUTLINE_MATERIAL = new MeshBasicMaterial({
  color: OUTLINE_COLOR,
  side: BackSide,
});
setSkipGTAO(FILL_MATERIAL, true);
setSkipGTAO(OUTLINE_MATERIAL, true);

const fileOutlines = new Map<string, MeshBasicMaterial>();
const fileOutline = (color: string): MeshBasicMaterial => {
  let material = fileOutlines.get(color);
  if (!material) {
    material = new MeshBasicMaterial({color, side: BackSide});
    setSkipGTAO(material, true);
    fileOutlines.set(color, material);
  }
  return material;
};

const outlineOf = (item: Item): MeshBasicMaterial => {
  if (item.kind !== FILE_KIND) {
    return OUTLINE_MATERIAL;
  }
  const color = parseFileData(item.data)?.color;
  return color === undefined ? OUTLINE_MATERIAL : fileOutline(color);
};

const SIZE = 0.1;
const OUTLINE_SCALE = 1.12;

// ライターは、置き場と同じ部品(items/lighter)を白い身体で描き、白い部品ごとに縁取る(蓋が開いて外形が変わるので、外形 1 つでは囲めない)。
// 継ぎ目・蝶番・ヤスリ車・芯は縁取りと同じ暗色。炎(lighterFlame)は世界の色に合わせたくすんだ赤の形に、細い赤茶の縁取りを付ける
const ACCENT_MATERIAL = new MeshBasicMaterial({color: OUTLINE_COLOR});
setSkipGTAO(ACCENT_MATERIAL, true);
const LIGHTER_MATERIALS: Record<LighterPartLook, MeshBasicMaterial> = {
  body: FILL_MATERIAL,
  accent: ACCENT_MATERIAL,
};
const CYLINDER_SEGMENTS = 10;
const UNIT_GEOMETRIES: Record<
  LighterPartShape,
  BoxGeometry | CylinderGeometry
> = {
  box: new BoxGeometry(1, 1, 1),
  cylinder: new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS),
};
/** 部品 1 つ。白い部品(body)は、裏面の縁取りも付ける */
function LighterPartMesh({part}: {part: LighterPart}) {
  const outline =
    part.look === "body"
      ? (part.scale.map(
          (v) => v + 2 * LIGHTER_HELD_OUTLINE,
        ) as LighterPart["scale"])
      : null;
  const rotation = part.rotation && {rotation: part.rotation};
  return (
    <>
      <mesh
        geometry={UNIT_GEOMETRIES[part.shape]}
        material={LIGHTER_MATERIALS[part.look]}
        position={part.position}
        scale={part.scale}
        frustumCulled={false}
        {...rotation}
      />
      {outline && (
        <mesh
          geometry={UNIT_GEOMETRIES[part.shape]}
          material={OUTLINE_MATERIAL}
          position={part.position}
          scale={outline}
          frustumCulled={false}
          {...rotation}
        />
      )}
    </>
  );
}

/**
 * 手元のライター。原点(両手首の中点)に、閉じたライターの中心が来るように置く。
 * 持った瞬間から、蓋を蝶番で開き、少し遅れて芯の上に炎を灯す(heldLighterPose)。炎の揺らぎは炎のシェーダーが付ける(lighterFlame)。
 * 持ち替えるとマウントし直すので、持つたびに最初から開く
 */
function HeldLighter() {
  const lid = useRef<Group>(null);
  const flame = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);

  useFrame(({clock}) => {
    const now = clock.elapsedTime;
    startedAt.current ??= now;
    const {lidAngle, flame: size} = heldLighterPose(
      (now - startedAt.current) * 1000,
    );
    if (lid.current) {
      lid.current.rotation.z = lidAngle;
    }
    if (flame.current) {
      flame.current.visible = size > 0;
      flame.current.scale.setScalar(size);
    }
  });

  return (
    <group scale={LIGHTER_HELD_SCALE}>
      <group position={[0, -LIGHTER_HELD_CENTER_Y, 0]}>
        {[...LIGHTER_CASE_PARTS, ...LIGHTER_INSERT_PARTS].map((part, i) => (
          <LighterPartMesh key={i} part={part} />
        ))}
        <group ref={lid} position={LIGHTER_LID_PIVOT}>
          <LighterPartMesh part={LIGHTER_LID_PART} />
        </group>
        {/* 炎は根元を原点にした単位の形(lighterFlame)を、LIGHTER_FLAME_SIZE に伸ばす。縁取りも同じ形・同じ揺らぎ。灯る(ignite)間は group の scale で膨らませる */}
        <group
          ref={flame}
          name="lighter-flame"
          position={LIGHTER_FLAME_BASE}
          visible={false}
        >
          <mesh
            geometry={FLAME_GEOMETRY}
            material={FLAME_MATERIAL}
            scale={LIGHTER_FLAME_SIZE}
            frustumCulled={false}
          />
          <mesh
            geometry={FLAME_GEOMETRY}
            material={FLAME_OUTLINE_MATERIAL}
            scale={LIGHTER_FLAME_SIZE}
            frustumCulled={false}
          />
        </group>
      </group>
    </group>
  );
}

/**
 * 手元に出すアイテムのメッシュ。ライターは Zippo 型のモデル(HeldLighter。蓋を開いて火を灯す)、それ以外はダミーの箱。
 * ファイルは、縁の色を data.color にする(色が無ければ従来の暗い縁)
 */
export function HeldItem({item}: {item: Item}) {
  if (item.kind === LIGHTER_KIND) {
    return (
      <group name={`held-item:${item.kind}`}>
        <HeldLighter />
      </group>
    );
  }
  return (
    <group name={`held-item:${item.kind}`}>
      <mesh material={FILL_MATERIAL} frustumCulled={false}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
      <mesh
        material={outlineOf(item)}
        scale={OUTLINE_SCALE}
        frustumCulled={false}
      >
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
    </group>
  );
}
