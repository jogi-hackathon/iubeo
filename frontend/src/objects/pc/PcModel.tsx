import {type Ref, useLayoutEffect, useMemo, useRef} from "react";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import type {InstancedMesh, Mesh, MeshBasicNodeMaterial} from "three/webgpu";
import {Matrix4} from "three/webgpu";

import {aoModeUserData} from "../../bake/aoMode";
import {HINGE, LAPTOP, LID, SCREEN, TRACKPAD} from "./dimensions";
import {KEY_CAP_GROUPS, KEYBOARD, type KeyCapGroup} from "./keyboard";
import {createKeyCapGeometry} from "./keyCapGeometry";

const SHELL = "#f3f3f3";
const SHELL_DARK = "#dddddd";

const ROUNDED_SEGMENTS = 1;
const BASE_RADIUS = 0.004;
const LID_RADIUS = 0.0025;
const LID_GAP = 0.004;
const KEY_HEIGHT = 0.002;
const KEY_TOP_INSET = 0.0012;
const WELL_FLOOR = 0.0004;
const WELL_MARGIN = 0.004;
const RIM_WIDTH = 0.003;
const RIM_HEIGHT = 0.001;
const BEZEL_INSET = 0.004;
const BEZEL_THICKNESS = 0.002;
const HINGE_SEGMENTS = 16;

type Vec3 = [number, number, number];

export function PcModel({
  screen,
  screenRef,
}: {
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
}) {
  return (
    <group userData={aoModeUserData("realtime")}>
      <Base />
      <Lid screen={screen} screenRef={screenRef} />
    </group>
  );
}

function Base() {
  const {z, width, depth, thickness} = LAPTOP;
  return (
    <group>
      <RoundedBox
        position={[0, thickness / 2, z]}
        size={[width, thickness, depth]}
        radius={BASE_RADIUS}
        color={SHELL}
      />
      <KeyboardWell />
      <Box
        position={[0, thickness + WELL_FLOOR / 2, TRACKPAD.z]}
        size={[TRACKPAD.width, WELL_FLOOR, TRACKPAD.depth]}
        color={SHELL_DARK}
        roughness={0.35}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * HINGE.x, HINGE.y, HINGE.z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry
            args={[HINGE.radius, HINGE.radius, HINGE.length, HINGE_SEGMENTS]}
          />
          <meshStandardMaterial color={SHELL_DARK} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function KeyboardWell() {
  const {thickness} = LAPTOP;
  const innerWidth = KEYBOARD.width + WELL_MARGIN;
  const innerDepth = KEYBOARD.depth + WELL_MARGIN;
  const outerWidth = innerWidth + 2 * RIM_WIDTH;
  const outerDepth = innerDepth + 2 * RIM_WIDTH;
  const rimY = thickness + RIM_HEIGHT / 2;
  return (
    <group>
      <Box
        position={[0, thickness + WELL_FLOOR / 2, KEYBOARD.z]}
        size={[innerWidth, WELL_FLOOR, innerDepth]}
        color={SHELL_DARK}
      />
      {[-1, 1].map((side) => (
        <Box
          key={`x${side}`}
          position={[(side * (innerWidth + RIM_WIDTH)) / 2, rimY, KEYBOARD.z]}
          size={[RIM_WIDTH, RIM_HEIGHT, outerDepth]}
          color={SHELL}
        />
      ))}
      {[-1, 1].map((side) => (
        <Box
          key={`z${side}`}
          position={[
            0,
            rimY,
            KEYBOARD.z + (side * (innerDepth + RIM_WIDTH)) / 2,
          ]}
          size={[outerWidth, RIM_HEIGHT, RIM_WIDTH]}
          color={SHELL}
        />
      ))}
      <KeyCaps y={thickness + WELL_FLOOR + KEY_HEIGHT / 2} />
    </group>
  );
}

function Lid({
  screen,
  screenRef,
}: {
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
}) {
  const {height, thickness, tilt} = LID;
  const {width} = LAPTOP;
  const bodyHeight = height - LID_GAP;
  const bodyY = LID_GAP + bodyHeight / 2;
  return (
    <group position={[0, HINGE.y, HINGE.z]} rotation={[-tilt, 0, 0]}>
      <RoundedBox
        position={[0, bodyY, -thickness / 2]}
        size={[width, bodyHeight, thickness]}
        radius={LID_RADIUS}
        color={SHELL}
      />
      <Box
        position={[0, bodyY, BEZEL_THICKNESS / 2]}
        size={[width - BEZEL_INSET, bodyHeight - BEZEL_INSET, BEZEL_THICKNESS]}
        color={SHELL_DARK}
        roughness={0.42}
      />
      <mesh
        ref={screenRef}
        material={screen}
        position={[0, height / 2, BEZEL_THICKNESS + 0.0005]}
      >
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
      </mesh>
    </group>
  );
}

function KeyCaps({y}: {y: number}) {
  return (
    <group>
      {KEY_CAP_GROUPS.map((group) => (
        <KeyCapInstances
          key={`${group.width}:${group.depth}`}
          group={group}
          y={y}
        />
      ))}
    </group>
  );
}

function KeyCapInstances({group, y}: {group: KeyCapGroup; y: number}) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(
    () =>
      createKeyCapGeometry(group.width, group.depth, KEY_HEIGHT, KEY_TOP_INSET),
    [group.width, group.depth],
  );
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const matrix = new Matrix4();
    for (const [index, cap] of group.caps.entries()) {
      matrix.makeTranslation(cap.x, y, KEYBOARD.z + cap.z);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [group, y]);

  return (
    <instancedMesh
      ref={ref}
      geometry={geometry}
      args={[undefined, undefined, group.caps.length]}
    >
      <meshStandardMaterial color="#ffffff" roughness={0.5} />
    </instancedMesh>
  );
}

function RoundedBox({
  position,
  size,
  radius,
  color,
  roughness = 0.72,
  metalness = 0.04,
}: {
  position: Vec3;
  size: Vec3;
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  const [width, height, depth] = size;
  const geometry = useMemo(
    () =>
      new RoundedBoxGeometry(width, height, depth, ROUNDED_SEGMENTS, radius),
    [width, height, depth, radius],
  );
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={position} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

function Box({
  position,
  size,
  color,
  roughness = 0.72,
  metalness = 0.04,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}
