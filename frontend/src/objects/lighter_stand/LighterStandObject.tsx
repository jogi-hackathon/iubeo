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
