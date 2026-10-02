import {useFrame} from "@react-three/fiber";
import {useRef} from "react";
import {BoxGeometry, CylinderGeometry, MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import type {GameObject} from "../types";
import {
  DESK_HEIGHT,
  DESK_PARTS,
  type DeskPart,
  type PartLook,
  type PartShape,
  WORK_AREA_SIZE,
} from "./desk";

const CYLINDER_SEGMENTS = 10;

// 部品はみな同じ単位の形を scale で伸ばすので、ジオメトリとマテリアルは種類ごとに 1 つを共有する(手元のアイテムと同じ)
const GEOMETRIES: Record<PartShape, BoxGeometry | CylinderGeometry> = {
  box: new BoxGeometry(1, 1, 1),
  cylinder: new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS),
};
const MATERIALS: Record<PartLook, MeshStandardMaterial> = {
  top: new MeshStandardMaterial({color: "#f4f2ec"}),
  frame: new MeshStandardMaterial({color: "#d8d5cc"}),
  accent: new MeshStandardMaterial({color: "#3a3a3a"}),
  paper: new MeshStandardMaterial({color: "#fbfaf6"}),
};

// アニメーションのモックの、天板上の光る板(作業スペースいっぱいに出す)
const PANEL_THICKNESS = 0.02;
const PANEL_COLOR = "#7fd1ff";
const PANEL_PULSE_HZ = 2;

function Part({part}: {part: DeskPart}) {
  return (
    <mesh
      geometry={GEOMETRIES[part.shape]}
      material={MATERIALS[part.look]}
      position={part.position}
      scale={part.scale}
      {...(part.rotation && {rotation: part.rotation})}
    />
  );
}

/**
 * アクション中のアニメーションのモック。天板の作業スペースの上の光る板を脈動させる。
 * 本物のアニメーションができたら、この部品を差し替える(WorkspaceObject は、作業中の間だけ置く)
 */
export function WorkspaceActionAnimation() {
  const material = useRef<MeshStandardMaterial>(null);

  useFrame(({clock}) => {
    if (material.current) {
      const wave =
        0.5 + 0.5 * Math.sin(clock.elapsedTime * Math.PI * 2 * PANEL_PULSE_HZ);
      material.current.emissiveIntensity = 0.3 + 1.7 * wave;
    }
  });

  return (
    <mesh position={[0, DESK_HEIGHT + PANEL_THICKNESS / 2, 0]}>
      <boxGeometry
        args={[WORK_AREA_SIZE[0], PANEL_THICKNESS, WORK_AREA_SIZE[1]]}
      />
      <meshStandardMaterial
        ref={material}
        color={PANEL_COLOR}
        emissive={PANEL_COLOR}
      />
    </mesh>
  );
}

/**
 * ワークスペース: 作業机のモック(ファイルの編集・新規作成をする場所)。寸法と部品の配置は desk.ts。
 * 天板と幕板・脚と貫の骨組み・右の引き出し、天板の上に紙の束・ペン立てを置き、
 * 中央の作業スペース(WORK_AREA_SIZE)は空けておく。作業中(users に誰かいる)の間だけ、そこに WorkspaceActionAnimation を出す。
 *
 * - 動的に増減するオブジェクトなのでベイクAOの対象外(realtime)。ManagedObjects の他の kind と同じ
 * - モックなので、コライダーは持たない
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙っても机に当たり、アウトラインは机全体の外周に 1 本付く
 */
export function WorkspaceObject({object}: {object: GameObject}) {
  return (
    <group userData={aoModeUserData("realtime")}>
      {DESK_PARTS.map((part, i) => (
        <Part key={i} part={part} />
      ))}
      {object.users.length > 0 && <WorkspaceActionAnimation />}
    </group>
  );
}
