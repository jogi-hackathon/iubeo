import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {
  BackSide,
  CylinderGeometry,
  FrontSide,
  type Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Vector3Tuple,
} from "three";

import {FLY_ARC, SLIP_FLY_MS, slipFlight} from "../../game/slip/flight";
import {useMemoAt} from "../../game/slip/memos";
import {
  createSlipTexture,
  createStripGeometry,
  shapeStrip,
  slipBackTexture,
} from "../../game/slip/slipPaper";
import {orderSlip, useOrderSlip} from "../../game/slip/store";
import {SLIP_LENGTH} from "../../game/slip/strip";
import {PAPER_CURL} from "../../game/slip/terminal";
import {DESK_HEIGHT} from "./desk";

/** 机の左奥に置くメモ置き(クリップ)。伝票はクリップから下がる */
export const MEMO_STAND = {
  position: [-0.52, DESK_HEIGHT, -0.2] as Vector3Tuple,
  yaw: -0.35,
  baseRadius: 0.024,
  baseHeight: 0.008,
  stemRadius: 0.003,
  stemHeight: 0.125,
  clip: [0.03, 0.012, 0.007] as Vector3Tuple,
  /** 伝票を少し後ろへ傾ける */
  tilt: -0.12,
} as const;

const CYLINDER_SEGMENTS = 12;
const ACCENT = new MeshStandardMaterial({color: "#3a3a3a"});
const BASE_GEOMETRY = new CylinderGeometry(
  MEMO_STAND.baseRadius,
  MEMO_STAND.baseRadius,
  MEMO_STAND.baseHeight,
  CYLINDER_SEGMENTS,
);
const STEM_GEOMETRY = new CylinderGeometry(
  MEMO_STAND.stemRadius,
  MEMO_STAND.stemRadius,
  MEMO_STAND.stemHeight,
  8,
);

/** 伝票の根元(帯の原点)の置き場。クリップの下から紙の長さぶん下がったところ。巻きで上端が少し前へ出る */
const SLIP_ROOT: Vector3Tuple = [
  0,
  MEMO_STAND.baseHeight + MEMO_STAND.stemHeight - SLIP_LENGTH * 0.985,
  MEMO_STAND.clip[2] / 2 + 0.001,
];

const standQuaternion = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  MEMO_STAND.yaw,
);
const tiltQuaternion = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  MEMO_STAND.tilt,
);
/** 机の座標系での、置かれた伝票の姿勢 */
const restQuaternion = standQuaternion.clone().multiply(tiltQuaternion);
const restPosition = new Vector3(...SLIP_ROOT)
  .applyQuaternion(standQuaternion)
  .add(new Vector3(...MEMO_STAND.position));

const fromMatrix = new Matrix4();
const inverse = new Matrix4();
const fromPosition = new Vector3();
const fromQuaternion = new Quaternion();
const fromScale = new Vector3();

type Props = {workspaceId: string};

/**
 * 机のメモ置き。常にクリップを出し、伝票が飛んできたら机の座標系で受け止めて、そのまま残す。
 * 飛び始め(手元の伝票の世界座標)は store の flight にあり、この group の世界行列の逆で机の座標系へ直す
 */
export function WorkspaceMemo({workspaceId}: Props) {
  const placed = useMemoAt(workspaceId);
  const {flight} = useOrderSlip();
  const mine = flight?.workspaceId === workspaceId ? flight : null;
  const content = mine?.content ?? placed;
  const root = useRef<Group>(null);
  const slip = useRef<Group>(null);

  const res = useMemo(() => {
    if (!content) {
      return null;
    }
    const strip = createStripGeometry();
    shapeStrip(strip, {length: SLIP_LENGTH, curl: PAPER_CURL.rest});
    const front = createSlipTexture(content);
    return {
      strip,
      front,
      frontMaterial: new MeshStandardMaterial({
        map: front,
        alphaTest: 0.5,
        side: FrontSide,
        roughness: 0.9,
      }),
      backMaterial: new MeshStandardMaterial({
        map: slipBackTexture(),
        alphaTest: 0.5,
        side: BackSide,
        roughness: 0.9,
      }),
    };
  }, [content]);

  useEffect(
    () => () => {
      res?.strip.dispose();
      res?.front.dispose();
      res?.frontMaterial.dispose();
      res?.backMaterial.dispose();
    },
    [res],
  );

  useFrame(() => {
    const s = slip.current;
    const r = root.current;
    if (!s || !r) {
      return;
    }
    if (!mine) {
      s.position.copy(restPosition);
      s.quaternion.copy(restQuaternion);
      return;
    }
    // 飛び始めの世界座標を机の座標系へ
    r.updateWorldMatrix(true, false);
    inverse.copy(r.matrixWorld).invert();
    fromMatrix.fromArray(mine.from).premultiply(inverse);
    fromMatrix.decompose(fromPosition, fromQuaternion, fromScale);
    const t = Math.min(1, (performance.now() - mine.startedAt) / SLIP_FLY_MS);
    const {position, lift} = slipFlight(t);
    s.position.lerpVectors(fromPosition, restPosition, position);
    s.position.y += FLY_ARC * lift;
    s.quaternion.slerpQuaternions(fromQuaternion, restQuaternion, position);
    if (t >= 1 && orderSlip.getState().flight === mine) {
      orderSlip.land();
    }
  });

  return (
    <group ref={root}>
      <group position={MEMO_STAND.position} rotation={[0, MEMO_STAND.yaw, 0]}>
        <mesh
          geometry={BASE_GEOMETRY}
          material={ACCENT}
          position={[0, MEMO_STAND.baseHeight / 2, 0]}
        />
        <mesh
          geometry={STEM_GEOMETRY}
          material={ACCENT}
          position={[
            0,
            MEMO_STAND.baseHeight + MEMO_STAND.stemHeight / 2,
            -MEMO_STAND.clip[2] / 2,
          ]}
        />
        <mesh
          material={ACCENT}
          position={[0, MEMO_STAND.baseHeight + MEMO_STAND.stemHeight, 0]}
        >
          <boxGeometry args={MEMO_STAND.clip} />
        </mesh>
      </group>
      {res && (
        <group ref={slip} name="workspace-memo">
          <mesh
            geometry={res.strip}
            material={res.frontMaterial}
            frustumCulled={false}
          />
          <mesh
            geometry={res.strip}
            material={res.backMaterial}
            frustumCulled={false}
          />
        </group>
      )}
    </group>
  );
}
