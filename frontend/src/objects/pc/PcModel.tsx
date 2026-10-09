import {type Ref, useLayoutEffect, useMemo, useRef} from "react";
import type {InstancedMesh, Mesh, MeshBasicNodeMaterial} from "three/webgpu";
import {Matrix4} from "three/webgpu";

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
import {TaskMemo} from "./TaskMemo";

// 白い世界（IUBEO は色のない真っ白な世界）に合わせて、筐体はすべて白〜薄い灰色にする。
// 凹み（ベゼルの奥・電源ランプの枠）だけ、形が読める程度に暗くする
const SHELL = "#f3f3f1";
const SHELL_DARK = "#dedcd6";
const TRIM = "#c9c7c1";
const RECESS = "#4a4a4f";

const BEZEL_BAR_WIDTH = (MONITOR_BODY_WIDTH - SCREEN_OPENING_WIDTH) / 2;
const BEZEL_BAR_HEIGHT = (MONITOR_BODY_HEIGHT - SCREEN_OPENING_HEIGHT) / 2;
const BEZEL_BAR_DEPTH = 0.03;

const KEY_ROWS = 4;
const KEY_COLS = 14;
const KEY_PITCH = 0.03;

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
  /** ガラスに貼るマテリアル（CRT の TSL マテリアル） */
  screen: MeshBasicNodeMaterial;
  screenRef?: Ref<Mesh>;
  memoRef?: Ref<Mesh>;
  /** 電源ランプ */
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
      {/* 本体。前面が +MONITOR_FRONT_Z */}
      <Box
        position={[0, MONITOR_BODY_Y, 0]}
        size={[MONITOR_BODY_WIDTH, MONITOR_BODY_HEIGHT, MONITOR_BODY_DEPTH]}
        color={SHELL}
      />
      {/* 管を隠す後ろの絞り */}
      <Box
        position={[0, MONITOR_BODY_Y, -0.33]}
        size={[0.4, 0.31, 0.26]}
        color={SHELL_DARK}
      />

      {/* 開口部を囲むベゼル（4 本） */}
      <Box
        position={[0, barY, BEZEL_Z]}
        size={[MONITOR_BODY_WIDTH, BEZEL_BAR_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
      />
      <Box
        position={[
          0,
          MONITOR_BODY_Y - SCREEN_OPENING_HEIGHT / 2 - BEZEL_BAR_HEIGHT / 2,
          BEZEL_Z,
        ]}
        size={[MONITOR_BODY_WIDTH, BEZEL_BAR_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
      />
      <Box
        position={[-sideX, MONITOR_BODY_Y, BEZEL_Z]}
        size={[BEZEL_BAR_WIDTH, SCREEN_OPENING_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
      />
      <Box
        position={[sideX, MONITOR_BODY_Y, BEZEL_Z]}
        size={[BEZEL_BAR_WIDTH, SCREEN_OPENING_HEIGHT, BEZEL_BAR_DEPTH]}
        color={SHELL_DARK}
      />
      {/* ガラスと枠の境目の暗い彫り込み。無いとガラスが箱に貼った紙に見える */}
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

      {/* 曲面ガラス。レイキャストの対象はこのメッシュ */}
      <mesh
        ref={screenRef}
        geometry={glass}
        material={screen}
        position={[0, MONITOR_BODY_Y, SCREEN_Z]}
      />

      {/* 電源ランプ */}
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

      {/* 台座 */}
      <mesh position={[0, 0.03, -0.03]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.07, 20]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.8} />
      </mesh>
      <Box
        position={[0, 0.011, 0.005]}
        size={[0.26, 0.022, 0.2]}
        color={SHELL}
      />
    </group>
  );
}

/** タワー型の本体。前面に電源ボタンと、ドライブのスロットの線 */
function Tower() {
  const {x, z, width, height, depth} = TOWER;
  // 以下の座標は群（タワーの足元）の中。前面は群の +Z 側の面
  const frontZ = depth / 2;
  return (
    <group position={[x, 0, z]}>
      <Box
        position={[0, height / 2, 0]}
        size={[width, height, depth]}
        color={SHELL}
      />
      {/* 前面パネル（わずかに手前へ出す）と、その中の線 */}
      <Box
        position={[0, height / 2, depth / 2 + 0.002]}
        size={[width * 0.92, height * 0.94, 0.004]}
        color={SHELL_DARK}
      />
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          position={[0, height * 0.72 - index * 0.035, frontZ + 0.006]}
          size={[width * 0.6, 0.006, 0.004]}
          color={TRIM}
        />
      ))}
      {/* 電源ボタン */}
      <mesh
        position={[0, height * 0.2, frontZ + 0.008]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.018, 0.018, 0.01, 18]} />
        <meshStandardMaterial color={TRIM} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** キーボードの台と、キーキャップ（インスタンス描画で 1 回の描画にまとめる） */
function Keyboard() {
  const {z, width, depth, height} = KEYBOARD;
  return (
    <group>
      <Box
        position={[0, height / 2, z]}
        size={[width, height, depth]}
        color={SHELL}
      />
      <KeyCaps originZ={z} width={width} depth={depth} top={height} />
    </group>
  );
}

function KeyCaps({
  originZ,
  width,
  depth,
  top,
}: {
  originZ: number;
  width: number;
  depth: number;
  top: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const count = KEY_ROWS * KEY_COLS;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const matrix = new Matrix4();
    const left = -width / 2 + (width - (KEY_COLS - 1) * KEY_PITCH) / 2;
    const front =
      originZ - depth / 2 + (depth - (KEY_ROWS - 1) * KEY_PITCH) / 2;
    for (let row = 0; row < KEY_ROWS; row += 1) {
      for (let col = 0; col < KEY_COLS; col += 1) {
        matrix.makeTranslation(
          left + col * KEY_PITCH,
          top + 0.004,
          front + row * KEY_PITCH,
        );
        mesh.setMatrixAt(row * KEY_COLS + col, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [originZ, width, depth, top]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[KEY_PITCH * 0.78, 0.008, KEY_PITCH * 0.78]} />
      <meshStandardMaterial color="#ffffff" roughness={0.6} />
    </instancedMesh>
  );
}

function Mouse() {
  return (
    <Box
      position={[MOUSE.x, MOUSE.height / 2, MOUSE.z]}
      size={[MOUSE.width, MOUSE.height, MOUSE.depth]}
      color={SHELL}
    />
  );
}

/** 直方体の部品。色は白い世界の中での濃淡で区別する */
function Box({
  position,
  size,
  color,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.72} metalness={0.04} />
    </mesh>
  );
}
