import {useEffect, useMemo, useRef} from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  type Group,
  CylinderGeometry,
  MeshStandardMaterial,
} from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";

import {aoModeUserData} from "../../bake/aoMode";
import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
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

export function WorkspaceObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
  const {visible} = useObjectState();
  const {memo = true} = useLayoutSlot().item;
  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["writing"], root);
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
    <group ref={root} userData={aoModeUserData("realtime")}>
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
      <WorkspaceFile
        working={object.users.length > 0}
        onWritingStart={(cue) => sfx.play("writing", cue)}
        onWritingInterrupt={() => sfx.stop("writing")}
      />
      {memo && <WorkspaceMemo workspaceId={object.id} />}
    </group>
  );
}
