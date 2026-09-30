import {useFrame} from "@react-three/fiber";
import {type ReactNode, useMemo, useRef} from "react";
import {
  BackSide,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {MAX_DELTA} from "../../core/time";
import type {PlayerState} from "../types";
import {createAnimator, updateAnimator} from "./animator";
import {composeBone} from "./bone";
import {writeHeldItemPosition} from "./held";
import {BONES, J, JOINT_COUNT} from "./joints";
import {applyLean} from "./lean";
import {writePoints} from "./pose";

/** IUBEO は色の無い世界なので、白い世界に溶ける真っ白な身体に、暗い縁取りを付けて輪郭だけ残す */
const FILL_COLOR = "#ffffff";
const OUTLINE_COLOR = "#1a1a1a";
/** 縁取りの太さ(m)。一回り大きい裏面メッシュをはみ出させて作る */
const OUTLINE_WIDTH = 0.008;
const BONE_RADIUS = 0.015;
const JOINT_RADIUS = 0.03;
const HEAD_RADIUS = 0.11;

/**
 * 全プレイヤーで共有する材質。骨格は白い世界にそのまま馴染ませたいので、GTAO は掛けない
 * (aoMap を持たない材質は skipGTAO が無いと GTAO が掛かり、白い身体が灰色になる)
 */
const FILL_MATERIAL = new MeshBasicMaterial({color: FILL_COLOR});
const OUTLINE_MATERIAL = new MeshBasicMaterial({
  color: OUTLINE_COLOR,
  side: BackSide,
});
setSkipGTAO(FILL_MATERIAL, true);
setSkipGTAO(OUTLINE_MATERIAL, true);

interface PlayerSkeletonProps {
  /** 描画元。毎フレーム読むだけで、変更しない */
  state: PlayerState;
  /** アイテムを持っているか(ホールドの腕にする)。暫定の入力で、PlayerState に持たせる方針が決まったらそちらへ移す */
  holding?: boolean;
  /** 手元に出す物。両手首の中点の少し前・上(held.ts)に置く */
  handItem?: ReactNode;
  visible?: boolean;
  /** 頭と首の骨を隠す。自分の身体を一人称で見せるとき(頭がカメラと重なる)に使う */
  hideHead?: boolean;
}

const identity = new Quaternion();
const from = new Vector3();
const to = new Vector3();
const scale = new Vector3();
const matrix = new Matrix4();

interface Layer {
  bones: InstancedMesh;
  joints: InstancedMesh;
  /** 半径に足す太さ(m)。本体は 0、縁取りは OUTLINE_WIDTH */
  grow: number;
}

/** points(頭・首を含む描画用の点)から、1 層ぶんの骨と関節の行列を書く */
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

/**
 * 1 体ぶんのスケルトン(関節の球と、骨の細い円柱だけ)。足元が state.position、向きが state.yaw。
 * 骨を太線(Line2)にしないのは、近クリップ面をまたぐと頂点が引き伸ばされ、カメラが近いと画面を横切って見えるため
 */
export function PlayerSkeleton({
  state,
  holding = false,
  handItem,
  visible = true,
  hideHead = false,
}: PlayerSkeletonProps) {
  const group = useRef<Group>(null);
  const hand = useRef<Group>(null);
  const joints = useRef<InstancedMesh>(null);
  const bones = useRef<InstancedMesh>(null);
  const jointsOutline = useRef<InstancedMesh>(null);
  const bonesOutline = useRef<InstancedMesh>(null);
  const animator = useMemo(createAnimator, []);
  const points = useMemo(() => new Float32Array((JOINT_COUNT + 1) * 3), []);

  useFrame((_, delta) => {
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
    updateAnimator(animator, state, holding, Math.min(delta, MAX_DELTA));
    g.position.copy(state.position);
    g.rotation.y = state.yaw;

    writePoints(points, animator.pose);
    applyLean(points, state.pitch);
    if (hand.current) {
      writeHeldItemPosition(hand.current.position, points);
    }
    writeLayer(
      {bones: fillBones, joints: fillJoints, grow: 0},
      points,
      hideHead,
    );
    writeLayer(
      {bones: outlineBones, joints: outlineJoints, grow: OUTLINE_WIDTH},
      points,
      hideHead,
    );
  }, FRAME_PRIORITY.skeleton);

  // インスタンスの境界球は初期値のまま更新しないので、視錐台カリングを切る
  return (
    <group ref={group} visible={visible}>
      <instancedMesh
        ref={bones}
        args={[undefined, undefined, BONES.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 8, 1]} />
        <primitive object={FILL_MATERIAL} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={joints}
        args={[undefined, undefined, JOINT_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={FILL_MATERIAL} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={bonesOutline}
        args={[undefined, undefined, BONES.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 8, 1]} />
        <primitive object={OUTLINE_MATERIAL} attach="material" />
      </instancedMesh>
      <instancedMesh
        ref={jointsOutline}
        args={[undefined, undefined, JOINT_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <primitive object={OUTLINE_MATERIAL} attach="material" />
      </instancedMesh>
      <group ref={hand}>{handItem}</group>
    </group>
  );
}
