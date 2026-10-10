import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef, useState} from "react";
import {
  Euler,
  MeshBasicMaterial,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {setCameraDetached} from "../../core/cameraDetached";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {
  consumeLookDelta,
  isPointerLocked,
  usePointerLocked,
} from "../../core/input";
import {MAX_DELTA} from "../../core/time";
import {FILE_KIND, itemManager} from "../../items";
import {getEyePosition, localPlayer} from "../../player";
import type {Vec3} from "../../props/types";
import {objectManager} from "../objectStore";
import {cursorRay} from "./cursor";
import {getCursor, moveOverviewCursor, resetCursor} from "./cursorStore";
import type {StockFile} from "./data";
import {
  createFileAssigner,
  type FilePlate,
  pickFile,
  plateOf,
} from "./fileAssign";
import type {Candidate, MountainSizeName} from "./mountain";
import {overview, useOverviewState} from "./overview";
import {computeOverviewPose, overviewQuaternion} from "./overviewPose";

const TRANSITION_SECONDS = 0.6;
const AIM_READY = 0.85;
const HEAD_VISIBLE_BLEND = 0.15;

const OUTLINE = 0.02;
const OUTLINE_AIMED = 0.055;
const AIMED_SCALE = 1.1;
const THICKNESS = 0.012;
const LIFT = 0.02;

const FILL = new MeshBasicMaterial({color: "#ffffff"});
setSkipGTAO(FILL, true);

const euler = new Euler(0, 0, 0, "YXZ");
const fpPosition = new Vector3();
const fpQuaternion = new Quaternion();
const ovPosition = new Vector3();

type Props = {
  directoryId: string;
  position: Vec3;
  candidates: readonly Candidate[];
  size: MountainSizeName;
  stock: readonly StockFile[];
};

/**
 * ディレクトリの俯瞰ビュー。取り出すファイルを選ぶ間だけ、ディレクトリの中に出す。
 * カメラを山の真上へ補間で移し、在庫のファイルを山の束(下の方の段の、真上から見える束)にランダムに割り当てて色の縁を出し、仮想カーソルで狙って左クリックで取る。
 * ファイルを取れたら自動で、右クリックなら取らずに、一人称へ補間で戻る。
 * この間、プレイヤーの移動・視点入力とカメラは overview が預かり(core/playerControl)、視点入力はここが消費する。
 * カメラは固定で、マウスの移動量は画面上の仮想カーソル(OverviewCursor)を動かす
 */
export function DirectoryOverview({
  directoryId,
  position,
  candidates,
  size,
  stock,
}: Props) {
  const {aimedFileId} = useOverviewState();
  const {freeCamera} = useDebugFlags();
  const locked = usePointerLocked();
  const gl = useThree((s) => s.gl);

  const [pose] = useState(() =>
    computeOverviewPose(position, localPlayer.yaw, size),
  );
  const ovQuaternion = useMemo(
    () => overviewQuaternion(pose, new Quaternion()),
    [pose],
  );
  const view = useRef({blend: 0});

  useEffect(() => {
    resetCursor();
  }, []);

  const assigner = useRef(createFileAssigner(candidates.length));
  const assigned = useMemo(() => {
    assigner.current.sync(stock.map((f) => f.id));
    return stock.flatMap((file) => {
      const index = assigner.current.get(file.id);
      const candidate = index === undefined ? undefined : candidates[index];
      return candidate ? [{file, candidate}] : [];
    });
  }, [stock, candidates]);
  const plates = useMemo<FilePlate[]>(
    () =>
      assigned.map(({file, candidate}) =>
        plateOf(file.id, candidate, position, LIFT),
      ),
    [assigned, position],
  );

  useFrame(({camera, size}, delta) => {
    if (freeCamera) {
      overview.reset();
      return;
    }
    const {phase} = overview.getState();
    if (phase === "idle") {
      return;
    }
    const v = view.current;
    const dt = Math.min(delta, MAX_DELTA);
    const {dx, dy} = consumeLookDelta();
    if (phase === "active") {
      moveOverviewCursor(dx, dy, size);
      v.blend = Math.min(1, v.blend + dt / TRANSITION_SECONDS);
    } else {
      v.blend = Math.max(0, v.blend - dt / TRANSITION_SECONDS);
    }

    getEyePosition(localPlayer, fpPosition);
    fpQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
    ovPosition.set(...pose.position);
    setCameraDetached(v.blend > HEAD_VISIBLE_BLEND);
    const e = v.blend * v.blend * (3 - 2 * v.blend);
    camera.position.lerpVectors(fpPosition, ovPosition, e);
    camera.quaternion.slerpQuaternions(fpQuaternion, ovQuaternion, e);

    if (phase === "leaving") {
      if (v.blend === 0) {
        overview.finish();
      }
      return;
    }
    if (v.blend < AIM_READY) {
      overview.setAimedFile(null);
      return;
    }
    const {origin, direction} = cursorRay(
      getCursor(),
      camera.position,
      camera.quaternion,
      (camera as PerspectiveCamera).fov,
      size.width / size.height,
    );
    overview.setAimedFile(pickFile(origin, direction, plates));
  }, FRAME_PRIORITY.camera);

  useEffect(() => () => setCameraDetached(false), []);

  // pointer lock が外れたら(Esc)、狙えないので戻る
  useEffect(() => {
    if (!locked) {
      overview.leave();
    }
  }, [locked]);

  useEffect(() => {
    const doc = gl.domElement.ownerDocument;
    const onMouseDown = (e: MouseEvent) => {
      if (!isPointerLocked()) {
        return;
      }
      const {phase, aimedFileId: target} = overview.getState();
      if (e.button === 2) {
        overview.leave();
        return;
      }
      if (e.button !== 0 || phase !== "active" || target === null) {
        return;
      }
      if (overview.beginRequest()) {
        objectManager.interact(directoryId, {target});
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (overview.getState().phase === "idle") {
        return;
      }
      e.preventDefault();
      overview.leave();
    };
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("contextmenu", onContextMenu);
    const offSpawn = itemManager.on("spawn", ({item}) => {
      if (item.kind === FILE_KIND) {
        overview.leave();
      }
    });
    const offRejected = objectManager.on("interactRejected", (e) => {
      if (e.objectId === directoryId) {
        overview.endRequest();
      }
    });
    return () => {
      offRejected();
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("contextmenu", onContextMenu);
      offSpawn();
    };
  }, [gl, directoryId]);

  return (
    <group>
      {assigned.map(({file, candidate}) => (
        <FilePlateMesh
          key={file.id}
          color={file.color}
          aimed={file.id === aimedFileId}
          position={[candidate.x, candidate.topY + LIFT, candidate.z]}
          yaw={candidate.yaw}
          width={candidate.width}
          depth={candidate.depth}
        />
      ))}
    </group>
  );
}

type PlateProps = {
  color: string;
  aimed: boolean;
  position: Vec3;
  yaw: number;
  width: number;
  depth: number;
};

function FilePlateMesh({
  color,
  aimed,
  position,
  yaw,
  width,
  depth,
}: PlateProps) {
  const outlineMaterial = useMemo(() => {
    const m = new MeshBasicMaterial({color});
    setSkipGTAO(m, true);
    return m;
  }, [color]);
  useEffect(() => () => outlineMaterial.dispose(), [outlineMaterial]);

  const t = aimed ? OUTLINE_AIMED : OUTLINE;
  return (
    <group
      position={position}
      rotation={[0, yaw, 0]}
      scale={aimed ? AIMED_SCALE : 1}
    >
      <mesh material={FILL} frustumCulled={false}>
        <boxGeometry args={[width, THICKNESS, depth]} />
      </mesh>
      <mesh
        material={outlineMaterial}
        position={[0, -THICKNESS * 0.35, 0]}
        frustumCulled={false}
      >
        <boxGeometry args={[width + t * 2, THICKNESS, depth + t * 2]} />
      </mesh>
    </group>
  );
}
