import {useEffect, useMemo} from "react";
import {BoxGeometry, CylinderGeometry, MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {BVHCollider} from "../../core/bvh";
import {useControlLockWhileWorking} from "../controlLock";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {DESK_PARTS, type DeskPart, type PartLook} from "./desk";
import {WorkspaceFile} from "./WorkspaceFile";

const CYLINDER_SEGMENTS = 10;

const MATERIALS: Record<PartLook, MeshStandardMaterial> = {
  top: new MeshStandardMaterial({color: "#ffffff"}),
  frame: new MeshStandardMaterial({color: "#ffffff"}),
  accent: new MeshStandardMaterial({color: "#3a3a3a"}),
};

const partGeometry = ({shape, scale: [x, y, z]}: DeskPart) =>
  shape === "box"
    ? new BoxGeometry(x, y, z)
    : new CylinderGeometry(x, z, y, CYLINDER_SEGMENTS);

function Part({
  part,
  geometry,
}: {
  part: DeskPart;
  geometry: BoxGeometry | CylinderGeometry;
}) {
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
 * - 作業中の間は、プレイヤーの移動・視点を預かる(useControlLockWhileWorking)
 */
export function WorkspaceObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
  const {visible} = useObjectState();
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
        {DESK_PARTS.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i]!} />
        ))}
      </BVHCollider>
      <WorkspaceFile working={object.users.length > 0} />
    </group>
  );
}
