import {useFrame} from "@react-three/fiber";
import {useEffect, useRef} from "react";
import {Euler, type PerspectiveCamera, Quaternion, Vector3} from "three";

import {useMyPlayerId} from "../../authority/useMyPlayerId";
import {sfxEngine} from "../../core/audio/sfx/engine";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {consumeLookDelta} from "../../core/input";
import {
  lockPlayerControl,
  subscribePlayerControl,
} from "../../core/playerControl";
import {useSpectatePhase} from "../../core/spectate";
import {useObjectsState} from "../../objects/useObjects";
import {getEyePosition, localPlayer} from "../../player";
import {useGameState} from "../gameStore";
import {stockColorsOf} from "../stockColors";
import {memos} from "./memos";
import {myWorkspaceId, orderSlip, slipForPhase, useOrderSlip} from "./store";
import {STAGE_MS, stageStart, STOW_MS, TERMINAL_SEQUENCE_MS} from "./terminal";
import {heldSlipWorld, slipZoomBlend, slipZoomPose} from "./zoom";

export const SLIP_VIEW_PITCH = -0.25;
export const SLIP_VIEW_BLEND_MS = 400;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

export const slipViewBlend = (elapsedMs: number): number => {
  const inBlend = clamp01(elapsedMs / SLIP_VIEW_BLEND_MS);
  const outStart = stageStart("fly") + STOW_MS - SLIP_VIEW_BLEND_MS;
  const outBlend = clamp01((elapsedMs - outStart) / SLIP_VIEW_BLEND_MS);
  return easeInOut(inBlend) * (1 - easeInOut(outBlend));
};

const euler = new Euler(0, 0, 0, "YXZ");
const fpQuaternion = new Quaternion();
const viewQuaternion = new Quaternion();
const zoomPosition = new Vector3();
const zoomQuaternion = new Quaternion();

const SLIP_CUE = {
  printSeconds: STAGE_MS.print / 1000,
  feedSeconds: STAGE_MS.feed / 1000,
  tearSeconds: STAGE_MS.tear / 1000,
};

export function OrderSlipDirector() {
  const game = useGameState();
  const myPlayerId = useMyPlayerId();
  const spectate = useSpectatePhase();
  const {freeCamera} = useDebugFlags();
  const {playing} = useOrderSlip();
  const {objects} = useObjectsState();
  const delivered = useRef(new Set<number>());
  const printed = useRef<number | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  useEffect(() => {
    orderSlip.setTarget(myWorkspaceId(objects, myPlayerId));
  }, [objects, myPlayerId]);

  useEffect(() => {
    if (game.sessionStatus === null) {
      delivered.current.clear();
      orderSlip.reset();
      memos.clear();
    }
  }, [game.sessionStatus]);

  useEffect(() => {
    if (spectate !== "alive") {
      orderSlip.reset();
    }
  }, [spectate]);

  useEffect(() => {
    if (spectate !== "alive" || game.intermission) {
      return;
    }
    const content = slipForPhase(
      game.phase,
      myPlayerId,
      delivered.current,
      stockColorsOf(objectsRef.current),
    );
    if (content && game.phase) {
      delivered.current.add(game.phase.number);
      orderSlip.deliver(content);
    }
  }, [game.phase, game.intermission, myPlayerId, spectate]);

  useEffect(() => subscribePlayerControl(() => orderSlip.resume()), []);

  useEffect(() => (playing ? lockPlayerControl() : undefined), [playing]);

  useFrame(({camera}) => {
    if (!playing) {
      if (printed.current !== null) {
        sfxEngine.stopThem("slip");
        printed.current = null;
      }
      return;
    }
    consumeLookDelta();
    const elapsed = performance.now() - playing.startedAt;
    if (
      elapsed >= stageStart("print") &&
      printed.current !== playing.startedAt
    ) {
      printed.current = playing.startedAt;
      sfxEngine.them("slip", SLIP_CUE);
    }
    if (elapsed >= TERMINAL_SEQUENCE_MS) {
      orderSlip.finish();
      return;
    }
    if (freeCamera) {
      return;
    }
    getEyePosition(localPlayer, camera.position);
    fpQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
    viewQuaternion.setFromEuler(euler.set(SLIP_VIEW_PITCH, localPlayer.yaw, 0));
    camera.quaternion.slerpQuaternions(
      fpQuaternion,
      viewQuaternion,
      slipViewBlend(elapsed),
    );
    const zoom = slipZoomBlend(elapsed);
    if (zoom > 0) {
      slipZoomPose(
        heldSlipWorld,
        (camera as PerspectiveCamera).fov,
        zoomPosition,
        zoomQuaternion,
      );
      camera.position.lerp(zoomPosition, zoom);
      camera.quaternion.slerp(zoomQuaternion, zoom);
    }
  }, FRAME_PRIORITY.camera);

  return null;
}
