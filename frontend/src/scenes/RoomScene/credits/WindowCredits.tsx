import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Euler, type Mesh, Quaternion, Vector3} from "three";

import {cameraGlitch} from "../../../camera/postprocess";
import {useDebugFlags} from "../../../core/debug/flags";
import {FRAME_PRIORITY} from "../../../core/frameOrder";
import {
  consumeLookDelta,
  isPointerLocked,
  usePointerLocked,
} from "../../../core/input";
import {isPlayerControlLocked} from "../../../core/playerControl";
import {useSpectatePhase} from "../../../core/spectate";
import {MAX_DELTA} from "../../../core/time";
import {getEyePosition, localPlayer} from "../../../player";
import {createBoardMaterial, CreditBoard} from "./board";
import {CREDIT_LINES} from "./content";
import {
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Z,
  boardCenterY,
  layoutCredits,
  rollSeconds,
  VIEW_POSITION,
  VIEW_YAW,
} from "./roll";
import {
  boardVisible,
  GLITCH_MS,
  INITIAL_SEQUENCE,
  stepSequence,
} from "./sequence";
import {credits, useCreditsPhase} from "./store";
import {GAZE_SECONDS, gazesAtWindow, inWindowZone, stepGaze} from "./trigger";

/** 寄り始めのうち、窓のほうへ向き直るのに使う割合。向き直ってから窓をくぐる */
const TURN_SHARE = 0.4;

const euler = new Euler(0, 0, 0, "YXZ");
const eye = new Vector3();
const gaze = new Vector3();
const fpQuaternion = new Quaternion();
const viewPosition = new Vector3(...VIEW_POSITION);
const viewQuaternion = new Quaternion().setFromEuler(
  new Euler(0, VIEW_YAW, 0, "YXZ"),
);

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export function WindowCredits({windowVisible}: {windowVisible: boolean}) {
  const phase = useCreditsPhase();
  useGazeTrigger(windowVisible);
  useLeaveOnUnlock();
  useEffect(() => () => credits.reset(), []);
  return phase === "idle" ? null : <CreditsShow />;
}

const useGazeTrigger = (windowVisible: boolean): void => {
  const {freeCamera} = useDebugFlags();
  const spectate = useSpectatePhase();
  const elapsed = useRef(0);

  useFrame(({camera}, delta) => {
    const eligible =
      windowVisible &&
      !freeCamera &&
      spectate === "alive" &&
      isPointerLocked() &&
      !isPlayerControlLocked() &&
      credits.getPhase() === "idle";
    const gazing =
      eligible &&
      inWindowZone(localPlayer.position.x, localPlayer.position.z) &&
      gazesAtWindow(camera.position, camera.getWorldDirection(gaze));
    elapsed.current = stepGaze(
      elapsed.current,
      gazing,
      Math.min(delta, MAX_DELTA),
    );
    if (elapsed.current >= GAZE_SECONDS) {
      elapsed.current = 0;
      credits.enter();
    }
  }, FRAME_PRIORITY.interact);
};

const useLeaveOnUnlock = (): void => {
  const locked = usePointerLocked();
  useEffect(() => {
    if (!locked) {
      credits.leave();
    }
  }, [locked]);
};

/**
 * 流している間だけマウントする(入るたびに寄るところから始め直す)。
 */
function CreditsShow() {
  const layout = useMemo(() => layoutCredits(CREDIT_LINES), []);
  const board = useMemo(() => new CreditBoard(layout), [layout]);
  const material = useMemo(() => createBoardMaterial(board.texture), [board]);
  useEffect(
    () => () => {
      material.dispose();
      board.dispose();
    },
    [board, material],
  );

  const mesh = useRef<Mesh>(null);
  const sequence = useRef(INITIAL_SEQUENCE);
  const duration = rollSeconds(layout);

  // reset(シーンの遷移など)で打ち切られたら、その場でカメラを一人称の目へ戻す。
  // 遷移(ダイブ)は始まるときのカメラを出発点にするので、次のフレームを待たずに戻しておく
  const camera = useThree((s) => s.camera);
  useEffect(
    () =>
      credits.subscribe(() => {
        if (credits.getPhase() !== "idle") {
          return;
        }
        if (boardVisible(sequence.current)) {
          cameraGlitch.pulse(GLITCH_MS);
        }
        sequence.current = INITIAL_SEQUENCE;
        if (mesh.current) {
          mesh.current.visible = false;
        }
        getEyePosition(localPlayer, camera.position);
        camera.quaternion.setFromEuler(
          euler.set(localPlayer.pitch, localPlayer.yaw, 0),
        );
      }),
    [camera],
  );

  useFrame(({camera}, delta) => {
    const phase = credits.getPhase();
    if (phase === "idle") {
      return;
    }
    // 預かっている間の視点入力は捨てる(戻ったときに溜まった分で視点が飛ばないように)
    consumeLookDelta();
    const {next, events} = stepSequence(
      sequence.current,
      phase,
      Math.min(delta, MAX_DELTA),
      duration,
    );
    sequence.current = next;
    if (events.glitch) {
      cameraGlitch.pulse(GLITCH_MS);
    }

    getEyePosition(localPlayer, eye);
    fpQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
    camera.quaternion.slerpQuaternions(
      fpQuaternion,
      viewQuaternion,
      smoothstep(Math.min(1, next.zoom / TURN_SHARE)),
    );
    camera.position.lerpVectors(eye, viewPosition, smoothstep(next.zoom));

    if (mesh.current) {
      mesh.current.visible = boardVisible(next);
      mesh.current.position.y = boardCenterY(layout, next.roll);
    }

    if (events.rollEnded) {
      credits.leave();
    }
    if (events.finished) {
      credits.finish();
    }
  }, FRAME_PRIORITY.camera);

  return (
    <mesh
      ref={mesh}
      visible={false}
      position={[BOARD_X, boardCenterY(layout, 0), BOARD_Z]}
      rotation={[0, Math.PI / 2, 0]}
      material={material}
      raycast={() => {}}
    >
      <planeGeometry args={[BOARD_WIDTH, layout.height]} />
    </mesh>
  );
}
