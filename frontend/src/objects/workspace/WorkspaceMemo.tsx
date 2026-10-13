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
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Quaternion,
  type Texture,
  Vector3,
  type Vector3Tuple,
} from "three";

import {useMyPlayerId} from "../../authority/useMyPlayerId";
import {
  addPowerOutline,
  GUIDE_OUTLINE,
} from "../../camera/postprocess/powerOutlineSelection";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {consumeLookDelta, usePointerLocked} from "../../core/input";
import {usePlayerControlLocked} from "../../core/playerControl";
import {registerShaderSwatch} from "../../core/shaderSwatches";
import {useSpectatePhase} from "../../core/spectate";
import {MAX_DELTA} from "../../core/time";
import {useGameState} from "../../game/gameStore";
import {FLY_ARC, SLIP_FLY_MS, slipFlight} from "../../game/slip/flight";
import {isMemoDone, useMemoAt} from "../../game/slip/memos";
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
const MEMO_FACING = [0, 0.75] as const;

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
  clip: [0.03, 0.012, 0.024] as Vector3Tuple,
  stemZ: -0.008,
} as const;
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

const createSlipMaterials = (front: Texture) => ({
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
});

registerShaderSwatch("workspaceMemo", () => {
  const {frontMaterial, backMaterial} = createSlipMaterials(slipBackTexture());
  const strip = createStripGeometry();
  const group = new Group();
  group.add(new Mesh(strip, frontMaterial), new Mesh(strip, backMaterial));
  return group;
});

const SLIP_ROOT: Vector3Tuple = [
  0,
  MEMO_STAND.baseHeight + MEMO_STAND.stemHeight - SLIP_LENGTH * 0.985,
  0,
];

const restQuaternion = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  MEMO_STAND.yaw,
);
const restPosition = new Vector3(...SLIP_ROOT)
  .multiplyScalar(MEMO_SCALE)
  .applyQuaternion(restQuaternion)
  .add(new Vector3(...MEMO_STAND.position));

const viewCenter = new Vector3(0, (SLIP_LENGTH * MEMO_SCALE) / 2, 0)
  .applyQuaternion(restQuaternion)
  .add(restPosition);
const MEMO_VIEW_FILL = 0.85;
const MEMO_VIEW_SECONDS = 0.45;

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

const HIT_BOX: Vector3Tuple = [SLIP_WIDTH + 0.012, 0.145, 0.04];

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
  const {phase} = useGameState();
  const myPlayerId = useMyPlayerId();
  const guide =
    interactive && placed !== null && !isMemoDone(placed, phase, myPlayerId);

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

  const aimed = useIsAimed(targetId);
  useLayoutEffect(() => {
    const group = root.current;
    if (!guide || !group) {
      return;
    }
    return addPowerOutline(group, {...GUIDE_OUTLINE, dashed: !aimed});
  }, [guide, aimed]);

  const res = useMemo(() => {
    if (!content) {
      return null;
    }
    const strip = createStripGeometry();
    shapeStrip(strip, {length: SLIP_LENGTH, curl: PAPER_CURL.rest});
    const front = createSlipTexture(content);
    return {strip, front, ...createSlipMaterials(front)};
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
