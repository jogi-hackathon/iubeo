import {type Ref, useLayoutEffect, useRef} from "react";
import type {InstancedMesh, Mesh, MeshBasicNodeMaterial} from "three/webgpu";
import {Matrix4, Quaternion, Vector3} from "three/webgpu";

import {aoModeUserData} from "../../bake/aoMode";
import {HINGE, LAPTOP, LID, MEMO, SCREEN, TRACKPAD} from "./dimensions";
import {KEY_CAPS, KEYBOARD} from "./keyboard";
import {TaskMemo} from "./TaskMemo";

const SHELL = "#f3f3f1";
const SHELL_DARK = "#dedcd6";
const TRIM = "#c9c7c1";

const KEY_HEIGHT = 0.0015;
const WELL_HEIGHT = 0.0006;
const WELL_MARGIN = 0.004;
const BEZEL_INSET = 0.004;
const BEZEL_THICKNESS = 0.002;

type Vec3 = [number, number, number];

/**
 * PC の見た目（手続き的に組む。外部のモデルもテクスチャも使わない）。原点は机の天板の中心、正面は +Z。
 *
 * 木全体は realtime の AO にする（ベイクの対象に入れない。PC は出し入れされる物のため）。
 * コライダーは持たない（机と同じく、通り抜けの扱いは机に任せる）。
 */
export function PcModel({
  screen,
  screenRef,
  memoRef,
  showMemo = true,
  on,
}: {
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
  memoRef?: Ref<Mesh>;
  showMemo?: boolean;
  on: boolean;
}) {
  return (
    <group userData={aoModeUserData("realtime")}>
      <Base on={on} />
      <Lid screen={screen} screenRef={screenRef} />
      {showMemo && (
        <group position={[MEMO.x, 0, MEMO.z]} rotation={[MEMO.tilt, 0, 0]}>
          <TaskMemo ref={memoRef} />
        </group>
      )}
    </group>
  );
}

function Base({on}: {on: boolean}) {
  const {z, width, depth, thickness} = LAPTOP;
  return (
    <group>
      <Box
        position={[0, thickness / 2, z]}
        size={[width, thickness, depth]}
        color={SHELL}
      />
      <Box
        position={[0, thickness + WELL_HEIGHT / 2, KEYBOARD.z]}
        size={[
          KEYBOARD.width + WELL_MARGIN,
          WELL_HEIGHT,
          KEYBOARD.depth + WELL_MARGIN,
        ]}
        color={SHELL_DARK}
      />
      <KeyCaps y={thickness + WELL_HEIGHT + KEY_HEIGHT / 2} />
      <Box
        position={[0, thickness + WELL_HEIGHT / 2, TRACKPAD.z]}
        size={[TRACKPAD.width, WELL_HEIGHT, TRACKPAD.depth]}
        color={SHELL_DARK}
        roughness={0.35}
      />
      <mesh position={[0, HINGE.y, HINGE.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[HINGE.radius, HINGE.radius, width - 0.04, 16]}
        />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.6} />
      </mesh>
      <mesh position={[width / 2 - 0.03, thickness / 2, z + depth / 2 + 0.001]}>
        <sphereGeometry args={[0.003, 12, 12]} />
        <meshStandardMaterial
          color={on ? "#7dffa8" : "#8a8a8a"}
          emissive={on ? "#4dff8f" : "#000000"}
          emissiveIntensity={on ? 3.2 : 0}
          roughness={0.3}
        />
      </mesh>
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
  return (
    <group position={[0, HINGE.y, HINGE.z]} rotation={[-tilt, 0, 0]}>
      <Box
        position={[0, height / 2, -thickness / 2]}
        size={[width, height, thickness]}
        color={SHELL}
      />
      <Box
        position={[0, height / 2, BEZEL_THICKNESS / 2]}
        size={[width - BEZEL_INSET, height - BEZEL_INSET, BEZEL_THICKNESS]}
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
      <mesh
        position={[
          0,
          height / 2 + SCREEN.height / 2 + (height - SCREEN.height) / 4,
          BEZEL_THICKNESS + 0.0005,
        ]}
      >
        <sphereGeometry args={[0.0025, 12, 12]} />
        <meshStandardMaterial color={TRIM} roughness={0.5} />
      </mesh>
    </group>
  );
}

function KeyCaps({y}: {y: number}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    for (const [index, cap] of KEY_CAPS.entries()) {
      matrix.compose(
        position.set(cap.x, y, KEYBOARD.z + cap.z),
        quaternion,
        scale.set(cap.width, 1, cap.depth),
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [y]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, KEY_CAPS.length]}>
      <boxGeometry args={[1, KEY_HEIGHT, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.5} />
    </instancedMesh>
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
