import {type Ref, useLayoutEffect, useMemo, useRef} from "react";
import type {InstancedMesh, Mesh, MeshBasicNodeMaterial} from "three/webgpu";
import {CatmullRomCurve3, Matrix4, Vector3} from "three/webgpu";

import {aoModeUserData} from "../../bake/aoMode";
import {createCurvedScreenGeometry} from "./curvedScreen";
import {
  BEZEL_Z,
  KEYBOARD,
  MEMO,
  MONITOR_BODY_DEPTH,
  MONITOR_BODY_HEIGHT,
  MONITOR_BODY_WIDTH,
  MONITOR_BODY_Y,
  MONITOR_FRONT_Z,
  MONITOR_TILT,
  MONITOR_Z,
  MOUSE,
  SCREEN_OPENING_HEIGHT,
  SCREEN_OPENING_WIDTH,
  SCREEN_Z,
  TOWER,
} from "./dimensions";
import {KEY_COUNT, keyPositions, keySize} from "./keyboard";
import {TaskMemo} from "./TaskMemo";

const SHELL = "#f3f3f1";
const SHELL_DARK = "#dedcd6";
const TRIM = "#c9c7c1";
const RECESS = "#4a4a4f";

const BEZEL_BAR_WIDTH = (MONITOR_BODY_WIDTH - SCREEN_OPENING_WIDTH) / 2;
const BEZEL_BAR_HEIGHT = (MONITOR_BODY_HEIGHT - SCREEN_OPENING_HEIGHT) / 2;
const BEZEL_BAR_DEPTH = 0.03;

type Vec3 = [number, number, number];

/**
 * PC の見た目（手続き的に組む。外部のモデルもテクスチャも使わない）。原点は机の天板の中心、正面は +Z。
 *
 * 構成: 18 インチ CRT（筐体・ベゼル・曲面ガラス）、タワー型の本体、キーボード、マウス、お題のメモ。
 * 木全体は realtime の AO にする（ベイクの対象に入れない。PC は出し入れされる物のため）。
 * コライダーは持たない（机と同じく、通り抜けの扱いは机に任せる）。
 */
export function PcModel({
  screen,
  screenRef,
  memoRef,
  on,
}: {
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
  memoRef?: Ref<Mesh>;
  on: boolean;
}) {
  const glass = useMemo(() => createCurvedScreenGeometry(), []);
  useLayoutEffect(() => () => glass.dispose(), [glass]);

  return (
    <group userData={aoModeUserData("realtime")}>
      <Monitor glass={glass} screen={screen} screenRef={screenRef} on={on} />
      <Tower />
      <Keyboard />
      <Mouse />
      <group position={[MEMO.x, 0, MEMO.z]} rotation={[MEMO.tilt, 0, 0]}>
        <TaskMemo ref={memoRef} />
      </group>
    </group>
  );
}

function Monitor({
  glass,
  screen,
  screenRef,
  on,
}: {
  glass: ReturnType<typeof createCurvedScreenGeometry>;
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
  on: boolean;
}) {
  const barY =
    MONITOR_BODY_Y + SCREEN_OPENING_HEIGHT / 2 + BEZEL_BAR_HEIGHT / 2;
  const sideX = SCREEN_OPENING_WIDTH / 2 + BEZEL_BAR_WIDTH / 2;
  return (
    <group position={[0, 0, MONITOR_Z]} rotation={[MONITOR_TILT, 0, 0]}>
      <Box
        position={[0, MONITOR_BODY_Y, 0]}
        size={[MONITOR_BODY_WIDTH, MONITOR_BODY_HEIGHT, MONITOR_BODY_DEPTH]}
        color={SHELL}
      />
      <group position={[0, MONITOR_BODY_Y, -0.22]} scale={[1, 0.77, 1]}>
        <mesh rotation={[Math.PI / 2, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.311, 0.08, 0.1, 4, 1]} />
          <meshStandardMaterial color={SHELL_DARK} roughness={0.85} />
        </mesh>
      </group>

      <Box
        position={[0, barY, BEZEL_Z]}
        size={[MONITOR_BODY_WIDTH, BEZEL_BAR_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
        roughness={0.42}
      />
      <Box
        position={[
          0,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 - BEZEL_BAR_HEIGHT / 2,
          BEZEL_Z,
        ]}
        size={[MONITOR_BODY_WIDTH, BEZEL_BAR_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
        roughness={0.42}
      />
      <Box
        position={[-sideX, MONITOR_BODY_Y, BEZEL_Z]}
        size={[BEZEL_BAR_WIDTH, SCREEN_OPENING_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
        roughness={0.42}
      />
      <Box
        position={[sideX, MONITOR_BODY_Y, BEZEL_Z]}
        size={[BEZEL_BAR_WIDTH, SCREEN_OPENING_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
        roughness={0.42}
      />
      <Box
        position={[
          0,
          MONITOR_BODY_Y + SCREEN_OPENING_HEIGHT / 2 - 0.004,
          MONITOR_FRONT_Z + 0.012,
        ]}
        size={[SCREEN_OPENING_WIDTH, 0.009, 0.028]}
        color={RECESS}
      />
      <Box
        position={[
          0,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 + 0.004,
          MONITOR_FRONT_Z + 0.012,
        ]}
        size={[SCREEN_OPENING_WIDTH, 0.009, 0.028]}
        color={RECESS}
      />
      <Box
        position={[
          -SCREEN_OPENING_WIDTH / 2 + 0.004,
          MONITOR_BODY_Y,
          MONITOR_FRONT_Z + 0.012,
        ]}
        size={[0.009, SCREEN_OPENING_HEIGHT, 0.028]}
        color={RECESS}
      />
      <Box
        position={[
          SCREEN_OPENING_WIDTH / 2 - 0.004,
          MONITOR_BODY_Y,
          MONITOR_FRONT_Z + 0.012,
        ]}
        size={[0.009, SCREEN_OPENING_HEIGHT, 0.028]}
        color={RECESS}
      />

      <Box
        position={[
          0,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 - BEZEL_BAR_HEIGHT / 2,
          BEZEL_Z + 0.017,
        ]}
        size={[0.09, 0.012, 0.004]}
        color={TRIM}
        roughness={0.45}
      />
      <mesh
        position={[
          -0.17,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 - BEZEL_BAR_HEIGHT / 2,
          BEZEL_Z + 0.02,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.018, 16]} />
        <meshStandardMaterial color={TRIM} roughness={0.5} />
      </mesh>

      <mesh
        ref={screenRef}
        geometry={glass}
        material={screen}
        position={[0, MONITOR_BODY_Y, SCREEN_Z]}
      />

      <mesh
        position={[
          0.17,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 - BEZEL_BAR_HEIGHT / 2,
          BEZEL_Z + 0.016,
        ]}
      >
        <sphereGeometry args={[0.0055, 12, 12]} />
        <meshStandardMaterial
          color={on ? "#7dffa8" : "#8a8a8a"}
          emissive={on ? "#4dff8f" : "#000000"}
          emissiveIntensity={on ? 3.2 : 0}
          roughness={0.3}
        />
      </mesh>

      <Box
        position={[0, 0.011, -0.01]}
        size={[0.34, 0.022, 0.26]}
        color={SHELL_DARK}
        roughness={0.75}
      />
      <mesh position={[0, 0.034, -0.02]}>
        <cylinderGeometry args={[0.05, 0.062, 0.028, 20]} />
        <meshStandardMaterial color={SHELL} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, -0.02]}>
        <cylinderGeometry args={[0.125, 0.125, 0.016, 24]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.55} />
      </mesh>
    </group>
  );
}

function Tower() {
  const {x, z, width, height, depth} = TOWER;
  const frontZ = depth / 2;
  return (
    <group position={[x, 0, z]}>
      <Box
        position={[0, height / 2, 0]}
        size={[width, height, depth]}
        color={SHELL}
      />
      <Box
        position={[0, height / 2, depth / 2 + 0.002]}
        size={[width * 0.92, height * 0.94, 0.004]}
        color={SHELL_DARK}
      />
      {[0.9, 0.82].map((at) => (
        <Box
          key={at}
          position={[0, height * at, frontZ + 0.006]}
          size={[width * 0.72, 0.03, 0.004]}
          color={RECESS}
          roughness={0.9}
        />
      ))}
      <Box
        position={[0, height * 0.72, frontZ + 0.006]}
        size={[width * 0.5, 0.009, 0.004]}
        color={RECESS}
        roughness={0.9}
      />
      <mesh
        position={[0, height * 0.6, frontZ + 0.008]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.018, 0.018, 0.01, 18]} />
        <meshStandardMaterial color={TRIM} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Keyboard() {
  const {z, width, depth, height} = KEYBOARD;
  return (
    <group>
      <Box
        position={[0, height / 2, z]}
        size={[width, height, depth]}
        color={SHELL_DARK}
      />
      <KeyCaps originZ={z} depth={depth} top={height} />
    </group>
  );
}

function KeyCaps({
  originZ,
  depth,
  top,
}: {
  originZ: number;
  depth: number;
  top: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const count = KEY_COUNT;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const matrix = new Matrix4();
    for (const [index, [x, z]] of keyPositions(originZ, depth).entries()) {
      matrix.makeTranslation(x, top + 0.003, z);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [originZ, depth, top]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[keySize(), 0.007, keySize()]} />
      <meshStandardMaterial color="#ffffff" roughness={0.5} />
    </instancedMesh>
  );
}

function Mouse() {
  const cable = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(MOUSE.x, 0.004, MOUSE.z - 0.04),
        new Vector3(MOUSE.x + 0.03, 0.006, MOUSE.z - 0.14),
        new Vector3(MOUSE.x + 0.05, 0.005, MOUSE.z - 0.26),
        new Vector3(TOWER.x, 0.012, TOWER.z + TOWER.depth / 2 + 0.01),
      ]),
    [],
  );
  return (
    <group>
      <mesh
        position={[MOUSE.x, 0, MOUSE.z]}
        scale={[MOUSE.width / 2, MOUSE.height, MOUSE.depth / 2]}
      >
        <sphereGeometry args={[1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={SHELL} roughness={0.5} />
      </mesh>
      <Box
        position={[MOUSE.x, MOUSE.height * 0.9, MOUSE.z - MOUSE.depth * 0.08]}
        size={[0.0018, 0.012, MOUSE.depth * 0.4]}
        color={TRIM}
        roughness={0.6}
      />
      <mesh>
        <tubeGeometry args={[cable, 28, 0.0025, 6, false]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.7} />
      </mesh>
    </group>
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
