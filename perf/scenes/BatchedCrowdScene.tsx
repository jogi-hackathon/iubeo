// 計測専用のプロトタイプ(製品には入らない)。全キャラクターの骨と関節を、4 つの InstancedMesh にまとめて描く。
// PlayerSkeleton をキャラクターごとに描く(CrowdScene)と比べて、描画オブジェクト数とバッファ更新の回数が減るかを見る。
// 姿勢の計算(アニメーター・ポーズ・傾き・骨の行列)は製品と同じ関数を使う。
import {useFrame} from "@react-three/fiber";
import {useMemo, useRef} from "react";
import {
  BackSide,
  BoxGeometry,
  CylinderGeometry,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";

import {MAX_DELTA} from "../../frontend/src/core/time";
import {createPlayerState, type PlayerState} from "../../frontend/src/player";
import {createAnimator, updateAnimator} from "../../frontend/src/player/skeleton/animator";
import {composeBone} from "../../frontend/src/player/skeleton/bone";
import {BONES, JOINT_COUNT} from "../../frontend/src/player/skeleton/joints";
import {applyLean} from "../../frontend/src/player/skeleton/lean";
import {createPose, writePoints} from "../../frontend/src/player/skeleton/pose";
import {TestLayout} from "../../frontend/src/scenes/TestScene/TestLayout";

const N = Math.max(0, Number(new URLSearchParams(location.search).get("n") ?? 10));
const OUTLINE_WIDTH = 0.008;
const BONE_RADIUS = 0.015;
const JOINT_RADIUS = 0.03;
const HEAD_RADIUS = 0.11;

const walk = (i: number) => {
  const radius = 2 + (i % 7) * 0.9;
  const cx = ((i % 9) - 4) * 2.2;
  const cz = -4 - Math.floor(i / 9) * 2.2;
  const speed = 1.2 + (i % 5) * 0.25;
  const phase = i * 0.37;
  return (t: number, s: PlayerState) => {
    const w = speed / radius;
    const a = w * t + phase;
    s.position.set(cx + radius * Math.cos(a), 0, cz + radius * Math.sin(a));
    s.velocity.set(-speed * Math.sin(a), 0, speed * Math.cos(a));
    s.onGround = true;
    s.yaw = Math.atan2(-s.velocity.x, -s.velocity.z);
  };
};

const FILL = new MeshBasicMaterial({color: "#ffffff"});
const OUTLINE = new MeshBasicMaterial({color: "#1a1a1a", side: BackSide});
const UP = new Vector3(0, 1, 0);
const identity = new Quaternion();
const matrix = new Matrix4();
const from = new Vector3();
const to = new Vector3();
const scale = new Vector3();

/** 全員ぶんの骨・関節の行列を、共有のバッファに書く */
function Batch({count}: {count: number}) {
  const boneRef = useRef<InstancedMesh>(null);
  const jointRef = useRef<InstancedMesh>(null);
  const boneOutRef = useRef<InstancedMesh>(null);
  const jointOutRef = useRef<InstancedMesh>(null);
  const chars = useMemo(
    () =>
      Array.from({length: count}, (_, i) => {
        const script = walk(i);
        const state = createPlayerState(0, 0, 0);
        script(0, state);
        return {script, state, animator: createAnimator(), points: new Float32Array((JOINT_COUNT + 1) * 3), world: new Float32Array((JOINT_COUNT + 1) * 3), holding: i % 3 === 0};
      }),
    [count],
  );
  const boneCount = BONES.length;

  useFrame(({clock}, delta) => {
    const dt = Math.min(delta, MAX_DELTA);
    const bones = boneRef.current;
    const joints = jointRef.current;
    const bonesOut = boneOutRef.current;
    const jointsOut = jointOutRef.current;
    if (!bones || !joints || !bonesOut || !jointsOut) return;
    for (let c = 0; c < chars.length; c++) {
      const ch = chars[c]!;
      ch.script(clock.elapsedTime, ch.state);
      updateAnimator(ch.animator, ch.state, ch.holding, dt);
      writePoints(ch.points, ch.animator.pose);
      applyLean(ch.points, ch.state.pitch);
      // 姿勢を世界座標に直す(位置と向き。製品では group の変換が担う)
      const p = ch.points;
      const cos = Math.cos(ch.state.yaw);
      const sin = Math.sin(ch.state.yaw);
      const px = ch.state.position.x;
      const py = ch.state.position.y;
      const pz = ch.state.position.z;
      const world = ch.world;
      for (let k = 0; k < JOINT_COUNT + 1; k++) {
        const x = p[k * 3]!;
        const y = p[k * 3 + 1]!;
        const z = p[k * 3 + 2]!;
        world[k * 3] = px + x * cos + z * sin;
        world[k * 3 + 1] = py + y;
        world[k * 3 + 2] = pz - x * sin + z * cos;
      }
      const jBase = c * JOINT_COUNT;
      const bBase = c * boneCount;
      for (let layer = 0; layer < 2; layer++) {
        const grow = layer === 0 ? 0 : OUTLINE_WIDTH;
        const jm = layer === 0 ? joints : jointsOut;
        const bm = layer === 0 ? bones : bonesOut;
        for (let i = 0; i < JOINT_COUNT; i++) {
          from.fromArray(world, i * 3);
          const radius = i === 0 ? HEAD_RADIUS : JOINT_RADIUS;
          scale.setScalar(Math.max(0, radius + grow));
          jm.setMatrixAt(jBase + i, matrix.compose(from, identity, scale));
        }
        for (const [i, [a, b]] of BONES.entries()) {
          from.fromArray(world, a * 3);
          to.fromArray(world, b * 3);
          bm.setMatrixAt(bBase + i, composeBone(matrix, from, to, BONE_RADIUS + grow));
        }
      }
    }
    // バッファの更新は 1 フレームに 1 回だけ(全員ぶんをまとめて送る)
    bones.instanceMatrix.needsUpdate = true;
    joints.instanceMatrix.needsUpdate = true;
    bonesOut.instanceMatrix.needsUpdate = true;
    jointsOut.instanceMatrix.needsUpdate = true;
  }, -2);

  const bc = count * boneCount;
  const jc = count * JOINT_COUNT;
  return (
    <>
      <instancedMesh ref={boneRef} args={[new CylinderGeometry(1, 1, 1, 8, 1), FILL, bc]} frustumCulled={false} />
      <instancedMesh ref={jointRef} args={[new SphereGeometry(1, 12, 8), FILL, jc]} frustumCulled={false} />
      <instancedMesh ref={boneOutRef} args={[new CylinderGeometry(1, 1, 1, 8, 1), OUTLINE, bc]} frustumCulled={false} />
      <instancedMesh ref={jointOutRef} args={[new SphereGeometry(1, 12, 8), OUTLINE, jc]} frustumCulled={false} />
    </>
  );
}

export function BatchedCrowdScene() {
  return (
    <>
      <TestLayout />
      <Batch key={N} count={N} />
    </>
  );
}
