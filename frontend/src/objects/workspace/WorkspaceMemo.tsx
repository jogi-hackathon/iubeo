import {useFrame, useThree} from "@react-three/fiber";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BackSide,
  CylinderGeometry,
  Euler,
  FrontSide,
  type Group,
  Matrix4,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
  type Vector3Tuple,
} from "three";

import {
  addPowerOutline,
  GUIDE_OUTLINE,
} from "../../camera/postprocess/powerOutlineSelection";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {consumeLookDelta, usePointerLocked} from "../../core/input";
import {usePlayerControlLocked} from "../../core/playerControl";
import {useSpectatePhase} from "../../core/spectate";
import {MAX_DELTA} from "../../core/time";
import {FLY_ARC, SLIP_FLY_MS, slipFlight} from "../../game/slip/flight";
import {useMemoAt} from "../../game/slip/memos";
import {memoView, useMemoView} from "../../game/slip/memoView";
import {
  createSlipTexture,
  createStripGeometry,
  shapeStrip,
  slipBackTexture,
} from "../../game/slip/slipPaper";
import {orderSlip, useOrderSlip} from "../../game/slip/store";
import {SLIP_LENGTH, SLIP_WIDTH} from "../../game/slip/strip";
import {PAPER_CURL} from "../../game/slip/terminal";
import {useItemState} from "../../items/useItems";
import {localPlayer} from "../../player/local";
import {getEyePosition} from "../../player/state";
import {useIsAimed} from "../interaction/aimStore";
import {registerClientTarget} from "../interaction/clientTargets";
import {OBJECT_ID_KEY, registerTarget} from "../interaction/targets";
import {DESK_HEIGHT} from "./desk";

const MEMO_POSITION: Vector3Tuple = [-0.5, DESK_HEIGHT, -0.2];
/** 伝票の表を向ける先(机の座標系の x, z)。机の手前中央、プレイヤーが立つあたり */
const MEMO_FACING = [0, 0.75] as const;

/**
 * 机の左奥に置くメモ置き(クリップ)。伝票はクリップからまっすぐ下がり、柱は紙の後ろに立つ。
 * 表は机の手前中央へ向ける。寸法は紙(58mm × 120mm)に対するもので、机の上では全体を MEMO_SCALE 倍にして読みやすくする
 */
export const MEMO_STAND = {
  position: MEMO_POSITION,
  yaw: Math.atan2(
    MEMO_FACING[0] - MEMO_POSITION[0],
    MEMO_FACING[1] - MEMO_POSITION[2],
  ),
  baseRadius: 0.024,
  baseHeight: 0.008,
  stemRadius: 0.003,
  stemHeight: 0.125,
  /** クリップ。奥行きは、巻いて前へ出る紙の上端まで挟めるだけ取る */
  clip: [0.03, 0.012, 0.024] as Vector3Tuple,
  /** 柱の位置(紙の後ろ) */
  stemZ: -0.008,
} as const;
/** 机の上での拡大率(紙も台も) */
export const MEMO_SCALE = 1.5;

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

/** 伝票の根元(帯の原点)の置き場(台の座標系)。クリップの下から紙の長さぶん下がったところ。巻きで上端が少し前へ出る */
const SLIP_ROOT: Vector3Tuple = [
  0,
  MEMO_STAND.baseHeight + MEMO_STAND.stemHeight - SLIP_LENGTH * 0.985,
  0,
];

/** 机の座標系での、置かれた伝票の姿勢 */
const restQuaternion = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  MEMO_STAND.yaw,
);
const restPosition = new Vector3(...SLIP_ROOT)
  .multiplyScalar(MEMO_SCALE)
  .applyQuaternion(restQuaternion)
  .add(new Vector3(...MEMO_STAND.position));

/** 拡大して見るときに寄る先: 置かれた伝票の真ん中(机の座標系)。カメラは表の正面から、伝票と同じ向きで見る */
const viewCenter = new Vector3(0, (SLIP_LENGTH * MEMO_SCALE) / 2, 0)
  .applyQuaternion(restQuaternion)
  .add(restPosition);
/** 拡大したときに伝票が画面の高さに占める割合 */
const MEMO_VIEW_FILL = 0.85;
/** 寄る(戻る)のにかける時間 */
const MEMO_VIEW_SECONDS = 0.45;

/** 縦の画角 fov(度)で、伝票が画面の高さの MEMO_VIEW_FILL を占める距離 */
export const memoViewDistance = (fov: number): number =>
  (SLIP_LENGTH * MEMO_SCALE) /
  2 /
  MEMO_VIEW_FILL /
  Math.tan((fov * Math.PI) / 360);

const euler = new Euler(0, 0, 0, "YXZ");
const fpPosition = new Vector3();
const fpQuaternion = new Quaternion();
const viewPosition = new Vector3();
const viewQuaternion = new Quaternion();
const viewForward = new Vector3();

const fromMatrix = new Matrix4();
const inverse = new Matrix4();
const fromPosition = new Vector3();
const fromQuaternion = new Quaternion();
const fromScale = new Vector3();

/** メモ置きを狙うときの当たり(台の座標系)。細い紙と柱を狙いやすいよう、まとめて箱で受ける */
const HIT_BOX: Vector3Tuple = [SLIP_WIDTH + 0.012, 0.145, 0.04];

/**
 * 拡大して見ている間のカメラ。目の位置から伝票の正面へ寄り、クリックか Esc(ポインタの解放)で戻る。
 * 戻りきったら預かりを解く(memoView)
 */
function MemoViewCamera({root}: {root: RefObject<Group | null>}) {
  const {phase} = useMemoView();
  const {freeCamera} = useDebugFlags();
  const locked = usePointerLocked();
  const alive = useSpectatePhase() === "alive";
  const gl = useThree((s) => s.gl);
  const blend = useRef(0);

  useEffect(() => {
    if (freeCamera || !alive) {
      memoView.reset();
    } else if (!locked) {
      memoView.leave();
    }
  }, [freeCamera, alive, locked]);

  useEffect(() => {
    if (phase !== "active") {
      return;
    }
    const doc = gl.domElement.ownerDocument;
    const onMouseDown = () => memoView.leave();
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("contextmenu", onContextMenu);
    return () => {
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("contextmenu", onContextMenu);
    };
  }, [phase, gl]);

  useFrame(({camera}, delta) => {
    const r = root.current;
    const {phase} = memoView.getState();
    if (phase === "idle" || !r) {
      return;
    }
    consumeLookDelta();
    const step = Math.min(delta, MAX_DELTA) / MEMO_VIEW_SECONDS;
    blend.current =
      phase === "active"
        ? Math.min(1, blend.current + step)
        : Math.max(0, blend.current - step);

    r.updateWorldMatrix(true, false);
    r.getWorldQuaternion(viewQuaternion).multiply(restQuaternion);
    viewForward.set(0, 0, 1).applyQuaternion(viewQuaternion);
    viewPosition
      .copy(viewCenter)
      .applyMatrix4(r.matrixWorld)
      .addScaledVector(
        viewForward,
        memoViewDistance((camera as PerspectiveCamera).fov),
      );
    getEyePosition(localPlayer, fpPosition);
    fpQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
    const b = blend.current;
    const e = b * b * (3 - 2 * b);
    camera.position.lerpVectors(fpPosition, viewPosition, e);
    camera.quaternion.slerpQuaternions(fpQuaternion, viewQuaternion, e);

    if (phase === "leaving" && b === 0) {
      memoView.finish();
    }
  }, FRAME_PRIORITY.camera);

  return null;
}

type Props = {workspaceId: string};

/**
 * 机のメモ置き。常にクリップを出し、伝票が飛んできたら机の座標系で受け止めて、そのまま残す。
 * 飛び始め(手元の伝票の世界座標)は store の flight にあり、この group の世界行列の逆で机の座標系へ直す。
 * 伝票が置かれていて手が空いていれば、メモ置きを破線で示し、クリックで寄って拡大して見る(MemoViewCamera)
 */
export function WorkspaceMemo({workspaceId}: Props) {
  const placed = useMemoAt(workspaceId);
  const {flight} = useOrderSlip();
  const mine = flight?.workspaceId === workspaceId ? flight : null;
  const content = mine?.content ?? placed;
  const root = useRef<Group>(null);
  const slip = useRef<Group>(null);

  const {held} = useItemState();
  const controlLocked = usePlayerControlLocked();
  const alive = useSpectatePhase() === "alive";
  const viewing = useMemoView().workspaceId === workspaceId;
  const interactive =
    placed !== null && !mine && held === null && !controlLocked && alive;
  const targetId = `${workspaceId}.memo`;

  // 見ている伝票が無くなった(セッションを離れた)・机ごと消えたら、その場で預かりを解く
  useEffect(() => {
    if (viewing && !placed) {
      memoView.reset();
    }
  }, [viewing, placed]);
  useEffect(
    () => () => {
      if (memoView.getState().workspaceId === workspaceId) {
        memoView.reset();
      }
    },
    [workspaceId],
  );

  useLayoutEffect(() => {
    const group = root.current;
    if (!interactive || !group) {
      return;
    }
    const offTarget = registerTarget(targetId, group);
    const offClient = registerClientTarget(targetId, {
      interact: () => memoView.enter(workspaceId),
    });
    return () => {
      offTarget();
      offClient();
    };
  }, [interactive, targetId, workspaceId]);

  // 照準が合っている間は破線を止めて、黒の実線にする
  const aimed = useIsAimed(targetId);
  useLayoutEffect(() => {
    const group = root.current;
    if (!interactive || !group) {
      return;
    }
    return addPowerOutline(group, {...GUIDE_OUTLINE, dashed: !aimed});
  }, [interactive, aimed]);

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
      s.scale.setScalar(MEMO_SCALE);
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
    s.scale.setScalar(1 + (MEMO_SCALE - 1) * position);
    if (t >= 1 && orderSlip.getState().flight === mine) {
      orderSlip.land();
    }
  });

  return (
    <group ref={root} userData={interactive ? {[OBJECT_ID_KEY]: targetId} : {}}>
      {viewing && placed && <MemoViewCamera root={root} />}
      <group
        position={MEMO_STAND.position}
        rotation={[0, MEMO_STAND.yaw, 0]}
        scale={MEMO_SCALE}
      >
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
            MEMO_STAND.stemZ,
          ]}
        />
        <mesh
          material={ACCENT}
          position={[0, MEMO_STAND.baseHeight + MEMO_STAND.stemHeight, 0]}
        >
          <boxGeometry args={MEMO_STAND.clip} />
        </mesh>
        {interactive && (
          <mesh visible={false} position={[0, HIT_BOX[1] / 2, 0]}>
            <boxGeometry args={HIT_BOX} />
          </mesh>
        )}
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
