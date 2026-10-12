import {useEffect, useMemo} from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";

import {aoModeUserData} from "../../bake/aoMode";
import {BVHCollider} from "../../core/bvh";
import {useControlLockWhileWorking} from "../controlLock";
import {useLayoutSlot} from "../layoutContext";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {
  DESK_BODY,
  DESK_FEET,
  DESK_PARTS,
  type DeskPart,
  type PartLook,
} from "./desk";
import {WorkspaceFile} from "./WorkspaceFile";
import {WorkspaceMemo} from "./WorkspaceMemo";

const CYLINDER_SEGMENTS = 10;

const MATERIALS: Record<PartLook, MeshStandardMaterial> = {
  top: new MeshStandardMaterial({color: "#ffffff"}),
  frame: new MeshStandardMaterial({color: "#ffffff"}),
  accent: new MeshStandardMaterial({color: "#3a3a3a"}),
};

const partGeometry = ({
  shape,
  scale: [x, y, z],
  radius,
  segments = 1,
}: DeskPart): BufferGeometry =>
  shape === "cylinder"
    ? new CylinderGeometry(x, z, y, CYLINDER_SEGMENTS)
    : radius
      ? new RoundedBoxGeometry(x, y, z, segments, radius)
      : new BoxGeometry(x, y, z);

function Part({part, geometry}: {part: DeskPart; geometry: BufferGeometry}) {
  return (
    <mesh
      geometry={geometry}
      material={MATERIALS[part.look]}
      position={part.position}
      {...(part.rotation && {rotation: part.rotation})}
    />
  );
}

/**
 * ワークスペース: 作業机のモック(ファイルの編集・新規作成をする場所)。寸法と部品の配置は desk.ts。
 *
 * - 動的に増減するオブジェクトなのでベイクAOの対象外(realtime)。ManagedObjects の他の kind と同じ
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙っても机に当たり、アウトラインは机全体の外周に 1 本付く
 * - 机の左奥にメモ置き(WorkspaceMemo)。依頼の伝票が飛んできて残る。レイアウトで memo: false なら置かない(部屋)
 */
export function WorkspaceObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
  const {visible} = useObjectState();
  const {memo = true} = useLayoutSlot().item;
  const geometries = useMemo(() => DESK_PARTS.map(partGeometry), []);
  useEffect(
    () => () => {
      for (const geometry of geometries) {
        geometry.dispose();
      }
    },
    [geometries],
  );
  return (
    <group userData={aoModeUserData("realtime")}>
      <BVHCollider enabled={visible}>
        {DESK_BODY.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i]!} />
        ))}
      </BVHCollider>
      {DESK_FEET.map((part, i) => (
        <Part
          key={i}
          part={part}
          geometry={geometries[DESK_BODY.length + i]!}
        />
      ))}
      <WorkspaceFile working={object.users.length > 0} />
      {memo && <WorkspaceMemo workspaceId={object.id} />}
    </group>
  );
}
