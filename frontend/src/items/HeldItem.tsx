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
  FILE_MODELS,
  type FilePart,
  type FilePartLook,
  type FilePartShape,
} from "./fileModel";
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

const outlineOf = (color: string | undefined): MeshBasicMaterial =>
  color === undefined ? OUTLINE_MATERIAL : fileOutline(color);

const DUMMY_SIZE = 0.1;
const DUMMY_OUTLINE_SCALE = 1.12;

const ACCENT_MATERIAL = new MeshBasicMaterial({color: OUTLINE_COLOR});
setSkipGTAO(ACCENT_MATERIAL, true);
const LIGHTER_MATERIALS: Record<LighterPartLook, MeshBasicMaterial> = {
  body: FILL_MATERIAL,
  accent: ACCENT_MATERIAL,
};
const CYLINDER_SEGMENTS = 10;
const UNIT_GEOMETRIES: Record<
  LighterPartShape | FilePartShape,
  BoxGeometry | CylinderGeometry
> = {
  box: new BoxGeometry(1, 1, 1),
  cylinder: new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS),
  prism: new CylinderGeometry(1, 1, 1, 3),
};
const FILE_MATERIALS: Record<FilePartLook, MeshBasicMaterial> = {
  paper: FILL_MATERIAL,
  blank: FILL_MATERIAL,
  ink: ACCENT_MATERIAL,
};

type PartMeshProps = {
  part: LighterPart | FilePart;
  fill: MeshBasicMaterial;
  outline: {material: MeshBasicMaterial; width: number} | null;
};

function PartMesh({part, fill, outline}: PartMeshProps) {
  const rotation = part.rotation && {rotation: part.rotation};
  return (
    <>
      <mesh
        geometry={UNIT_GEOMETRIES[part.shape]}
        material={fill}
        position={part.position}
        scale={part.scale}
        frustumCulled={false}
        {...rotation}
      />
      {outline && (
        <mesh
          geometry={UNIT_GEOMETRIES[part.shape]}
          material={outline.material}
          position={part.position}
          scale={
            part.scale.map((v) => v + 2 * outline.width) as LighterPart["scale"]
          }
          frustumCulled={false}
          {...rotation}
        />
      )}
    </>
  );
}

const LIGHTER_OUTLINE = {
  material: OUTLINE_MATERIAL,
  width: LIGHTER_HELD_OUTLINE,
};

function LighterPartMesh({part}: {part: LighterPart}) {
  return (
    <PartMesh
      part={part}
      fill={LIGHTER_MATERIALS[part.look]}
      outline={part.look === "body" ? LIGHTER_OUTLINE : null}
    />
  );
}

function HeldFile({item}: {item: Item}) {
  const data = parseFileData(item.data);
  if (!data) {
    return <HeldDummy />;
  }
  const model = FILE_MODELS[data.status];
  const outline = {material: outlineOf(data.color), width: model.outline};
  return (
    <>
      {model.parts.map((part, i) => (
        <PartMesh
          key={`${data.status}-${i}`}
          part={part}
          fill={FILE_MATERIALS[part.look]}
          outline={part.look === "paper" ? outline : null}
        />
      ))}
    </>
  );
}

function HeldDummy() {
  return (
    <>
      <mesh material={FILL_MATERIAL} frustumCulled={false}>
        <boxGeometry args={[DUMMY_SIZE, DUMMY_SIZE, DUMMY_SIZE]} />
      </mesh>
      <mesh
        material={OUTLINE_MATERIAL}
        scale={DUMMY_OUTLINE_SCALE}
        frustumCulled={false}
      >
        <boxGeometry args={[DUMMY_SIZE, DUMMY_SIZE, DUMMY_SIZE]} />
      </mesh>
    </>
  );
}

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

export function HeldItem({item}: {item: Item}) {
  return (
    <group name={`held-item:${item.kind}`}>
      {item.kind === LIGHTER_KIND ? (
        <HeldLighter />
      ) : item.kind === FILE_KIND ? (
        <HeldFile item={item} />
      ) : (
        <HeldDummy />
      )}
    </group>
  );
}
