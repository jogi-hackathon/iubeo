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
import type {Candidate} from "./mountain";
import {overview, useOverviewState} from "./overview";
import {computeOverviewPose, overviewQuaternion} from "./overviewPose";

/** 一人称 ⇄ 俯瞰の補間にかける時間(秒) */
const TRANSITION_SECONDS = 0.6;
/** 補間がここまで進んだら、狙い・クリックを受け付ける(入る途中の誤クリックを防ぐ) */
const AIM_READY = 0.85;
/** 補間がここまで進んだら、カメラは目の位置から離れたとみなして、自分の頭を見せる(戻りでは、これを下回ると隠す) */
const HEAD_VISIBLE_BLEND = 0.15;

const OUTLINE = 0.02;
const OUTLINE_AIMED = 0.055;
/** 狙っているファイルの拡大率 */
const AIMED_SCALE = 1.1;
const THICKNESS = 0.012;
/** 縁取りの板を、束の上面から浮かせる高さ(m)。同じ高さで重ねてちらつくのを避ける */
const LIFT = 0.02;

// ファイルは白い薄い板で、色は付けない。識別はアウトラインの色だけ(SPEC)。GTAO は掛けない(白が灰色になる)
const FILL = new MeshBasicMaterial({color: "#ffffff"});
setSkipGTAO(FILL, true);

const euler = new Euler(0, 0, 0, "YXZ");
const fpPosition = new Vector3();
const fpQuaternion = new Quaternion();
const ovPosition = new Vector3();

type Props = {
  directoryId: string;
  /** ディレクトリの足元の位置(ワールド座標) */
  position: Vec3;
  /** 在庫ファイルを割り当てられる束(山の束のうち、真上から見える物) */
  candidates: readonly Candidate[];
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
  stock,
}: Props) {
  const {aimedFileId} = useOverviewState();
  const {freeCamera} = useDebugFlags();
  const locked = usePointerLocked();
  const gl = useThree((s) => s.gl);

  // 入った時点のプレイヤーの向きから基準姿勢を決める(その間プレイヤーは動かない)
  const [pose] = useState(() => computeOverviewPose(position, localPlayer.yaw));
  // 俯瞰のカメラは、この基準姿勢で固定(視点は振らない)。狙いは画面上の仮想カーソルで行う
  const ovQuaternion = useMemo(
    () => overviewQuaternion(pose, new Quaternion()),
    [pose],
  );
  const view = useRef({blend: 0});

  // 入ったときは、カーソルを画面中央から始める
  useEffect(() => {
    resetCursor();
  }, []);

  // 束への割り当ては、俯瞰に入るたび(このコンポーネントが出るたび)に新しくランダムに決め、俯瞰の間は動かさない。
  // 在庫が変わったら、新しく現れたファイルだけを空いている束に足す(既にあるファイルは動かない)
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
      // FlyCamera に任せる。俯瞰はやめて、預かりも返す
      overview.reset();
      return;
    }
    const {phase} = overview.getState();
    if (phase === "idle") {
      return;
    }
    const v = view.current;
    const dt = Math.min(delta, MAX_DELTA);
    // 視点入力は、俯瞰の間ずっとここが消費する。active ならカーソルを動かし、戻る間は捨てる
    const {dx, dy} = consumeLookDelta();
    if (phase === "active") {
      moveOverviewCursor(dx, dy, size);
      v.blend = Math.min(1, v.blend + dt / TRANSITION_SECONDS);
    } else {
      v.blend = Math.max(0, v.blend - dt / TRANSITION_SECONDS);
    }

    // 一人称の姿勢(FirstPersonCamera と同じ)と俯瞰の姿勢を、イージングをかけて補間する
    getEyePosition(localPlayer, fpPosition);
    fpQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
    ovPosition.set(...pose.position);
    // しきい値をまたいだときだけ通知される(再レンダーは毎フレームは起きない)
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
    // カーソルを通る視線を、板の水平面に当てて判定する
    const {origin, direction} = cursorRay(
      getCursor(),
      camera.position,
      camera.quaternion,
      (camera as PerspectiveCamera).fov,
      size.width / size.height,
    );
    overview.setAimedFile(pickFile(origin, direction, plates));
  }, FRAME_PRIORITY.camera);

  // 俯瞰が終わったら(消えた場合も含む)、頭は隠す状態に戻す
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
        // 右クリックでの退出は、contextmenu に頼らず mousedown でも受ける(二重に呼んでも無害)
        overview.leave();
        return;
      }
      // 狙いは、入る補間が終わってから付く(入った瞬間のクリックはここでは取らない)
      if (e.button !== 0 || phase !== "active" || target === null) {
        return;
      }
      // 結果(spawn / 拒否)が来るまで、次の要求は送らない(非同期のサーバーで取り合いを二重に起こさない)
      if (overview.beginRequest()) {
        objectManager.interact(directoryId, {target});
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      // 俯瞰の間だけ、右クリックのメニューを止める
      if (overview.getState().phase === "idle") {
        return;
      }
      e.preventDefault();
      overview.leave();
    };
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("contextmenu", onContextMenu);
    // ファイルを取れた(手元に file が来た)ら、自動で戻る
    const offSpawn = itemManager.on("spawn", ({item}) => {
      if (item.kind === FILE_KIND) {
        overview.leave();
      }
    });
    // 自分の要求が拒否されたら(先に取られたなど)、俯瞰に残って次を選べるようにする
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
  /** 割り当てられた束の上面の大きさ */
  width: number;
  depth: number;
};

/** 束の上面と同じ大きさ・向きの白い薄い板 + 一回り大きい色つきの板(アウトライン)。狙っているときは太く、少し大きくする */
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
      {/* 板の下に、一回り大きい色板を敷いて縁だけを見せる */}
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
