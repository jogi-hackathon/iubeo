import {useFrame} from "@react-three/fiber";
import {type ReactNode, useEffect, useMemo, useRef} from "react";
import {
  type Group,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

import {listColliders} from "../../core/bvh";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {MAX_DELTA} from "../../core/time";
import type {PlayerState} from "../types";
import {createAnimator, updateAnimator} from "./animator";
import {BodyFire, bodyFireIgnition} from "./BodyFire";
import {composeBone} from "./bone";
import {bodyDecay, createSkeletonMaterials} from "./decay";
import {HeadSplash} from "./HeadSplash";
import {writeHeldItemPosition} from "./held";
import {BONES, J, JOINT_COUNT} from "./joints";
import {applyLean} from "./lean";
import {writePoints} from "./pose";
import {
  createRagdoll,
  startRagdoll,
  stepRagdoll,
  writeRagdollPose,
} from "./ragdoll";

const FILL_COLOR = "#ffffff";
const OUTLINE_COLOR = "#1a1a1a";
const OUTLINE_WIDTH = 0.008;
const BONE_RADIUS = 0.015;
const JOINT_RADIUS = 0.03;
const HEAD_RADIUS = 0.11;

interface PlayerSkeletonProps {
  state: PlayerState;
  holding?: boolean;
  handItem?: ReactNode;
  visible?: boolean;
  hideHead?: boolean;
  ragdoll?: boolean;
}

const identity = new Quaternion();
const from = new Vector3();
const to = new Vector3();
const scale = new Vector3();
const matrix = new Matrix4();

interface Layer {
  bones: InstancedMesh;
  joints: InstancedMesh;
  grow: number;
}

const writeLayer = (layer: Layer, points: Float32Array, hideHead: boolean) => {
  const {bones, joints, grow} = layer;
  for (let i = 0; i < JOINT_COUNT; i++) {
    from.fromArray(points, i * 3);
    const radius =
      i === J.head ? (hideHead ? -grow : HEAD_RADIUS) : JOINT_RADIUS;
    scale.setScalar(Math.max(0, radius + grow));
    joints.setMatrixAt(i, matrix.compose(from, identity, scale));
  }
  joints.instanceMatrix.needsUpdate = true;

  for (const [i, [a, b]] of BONES.entries()) {
    from.fromArray(points, a * 3);
    to.fromArray(points, b * 3);
    const hidden = hideHead && a === J.head;
    bones.setMatrixAt(
      i,
      composeBone(matrix, from, to, hidden ? 0 : BONE_RADIUS + grow),
    );
  }
  bones.instanceMatrix.needsUpdate = true;
};

export function PlayerSkeleton({
  state,
  holding = false,
  handItem,
  visible = true,
  hideHead = false,
  ragdoll = false,
}: PlayerSkeletonProps) {
  const group = useRef<Group>(null);
  const hand = useRef<Group>(null);
  const joints = useRef<InstancedMesh>(null);
  const bones = useRef<InstancedMesh>(null);
  const jointsOutline = useRef<InstancedMesh>(null);
  const bonesOutline = useRef<InstancedMesh>(null);
  const animator = useMemo(createAnimator, []);
  const points = useMemo(() => new Float32Array((JOINT_COUNT + 1) * 3), []);
  const body = useMemo(createRagdoll, []);
  const shown = useMemo(() => new Float32Array(JOINT_COUNT * 3), []);
  const materials = useMemo(
    () => createSkeletonMaterials(FILL_COLOR, OUTLINE_COLOR),
    [],
  );
  useEffect(() => () => materials.dispose(), [materials]);
  const diedAt = useRef<number | null>(null);

  useFrame(({clock}, delta) => {
    const g = group.current;
    const fillBones = bones.current;
    const fillJoints = joints.current;
    const outlineBones = bonesOutline.current;
    const outlineJoints = jointsOutline.current;
    if (
      !g ||
      !fillBones ||
      !fillJoints ||
      !outlineBones ||
      !outlineJoints ||
      !visible
    ) {
      return;
    }
    const dt = Math.min(delta, MAX_DELTA);
    if (!ragdoll) {
      body.active = false;
      diedAt.current = null;
    }
    diedAt.current ??= ragdoll ? clock.elapsedTime : null;
    const sinceDeath =
      diedAt.current === null ? -1 : clock.elapsedTime - diedAt.current;
    materials.decay.value = bodyDecay(sinceDeath);
    materials.blink.value = bodyFireIgnition(sinceDeath);
    const headless = hideHead || ragdoll;
    if (body.active) {
      stepRagdoll(body, dt, listColliders());
      writeRagdollPose(body, shown);
      writePoints(points, shown);
      g.position.set(0, 0, 0);
      g.rotation.y = 0;
    } else {
      updateAnimator(animator, state, holding, dt);
      writePoints(points, animator.pose);
      applyLean(points, state.pitch);
      g.position.copy(state.position);
      g.rotation.y = state.yaw;
      if (ragdoll) {
        startRagdoll(body, points, state.position, state.yaw, state.velocity);
      }
    }
    if (hand.current) {
      writeHeldItemPosition(hand.current.position, points);
    }
    writeLayer(
      {bones: fillBones, joints: fillJoints, grow: 0},
      points,
      headless,
    );
    writeLayer(
      {bones: outlineBones, joints: outlineJoints, grow: OUTLINE_WIDTH},
      points,
      headless,
    );
  }, FRAME_PRIORITY.skeleton);

  return (
    <group ref={group} visible={visible}>
      <instancedMesh
        ref={bones}
        args={[undefined, undefined, BONES.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 8, 1]} />
        <primitive object={materials.boneFill} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={joints}
        args={[undefined, undefined, JOINT_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={materials.jointFill} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={bonesOutline}
        args={[undefined, undefined, BONES.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 8, 1]} />
        <primitive object={materials.boneOutline} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={jointsOutline}
        args={[undefined, undefined, JOINT_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={materials.jointOutline} attach="material" />
      </instancedMesh>
      <group ref={hand}>{handItem}</group>
      {ragdoll && <BodyFire points={points} />}
      {ragdoll && <HeadSplash body={body} />}
    </group>
  );
}
