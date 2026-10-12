import {useFrame} from "@react-three/fiber";
import {useEffect, useRef} from "react";
import {Euler, Quaternion} from "three";

import {useMyPlayerId} from "../../authority/useMyPlayerId";
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
import {memos} from "./memos";
import {myWorkspaceId, orderSlip, slipForPhase, useOrderSlip} from "./store";
import {stageStart, STOW_MS, TERMINAL_SEQUENCE_MS} from "./terminal";

/** 再生中に視線を向ける手元の角度(下向き)。端末と千切った伝票が視界に収まる */
export const SLIP_VIEW_PITCH = -0.25;
/** 視線を手元へ向ける(戻す)のにかける時間 */
export const SLIP_VIEW_BLEND_MS = 400;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** 再生の経過時間から、視線をどれだけ手元へ向けているか(0..1)。始めに向け、端末をしまうのに合わせて戻す */
export const slipViewBlend = (elapsedMs: number): number => {
  const inBlend = clamp01(elapsedMs / SLIP_VIEW_BLEND_MS);
  const outStart = stageStart("fly") + STOW_MS - SLIP_VIEW_BLEND_MS;
  const outBlend = clamp01((elapsedMs - outStart) / SLIP_VIEW_BLEND_MS);
  return easeInOut(inBlend) * (1 - easeInOut(outBlend));
};

const euler = new Euler(0, 0, 0, "YXZ");
const fpQuaternion = new Quaternion();
const viewQuaternion = new Quaternion();

/**
 * 依頼の伝票の進行役。
 * - フェーズが始まって自分のタスクがあれば、伝票を届ける(store)。接続し直しで同じフェーズを受けても二度は出さない
 * - 再生中はプレイヤーの操作を預かり(移動も視線も止める)、視線を手元へ向ける。終わったら戻す
 * - 他の操作(PC・ワークスペース)に預けている間に届いた分は、空いてから始める
 * - 見終えた伝票は自分のワークスペースへ飛ばし、メモ置きに残す(WorkspaceMemo)
 * - 脱落したら、再生も待ちも捨てる
 */
export function OrderSlipDirector() {
  const game = useGameState();
  const myPlayerId = useMyPlayerId();
  const spectate = useSpectatePhase();
  const {freeCamera} = useDebugFlags();
  const {playing} = useOrderSlip();
  const {objects} = useObjectsState();
  const delivered = useRef(new Set<number>());

  // 伝票の飛んでいく先(自分のワークスペース)
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
    const content = slipForPhase(game.phase, myPlayerId, delivered.current);
    if (content && game.phase) {
      delivered.current.add(game.phase.number);
      orderSlip.deliver(content);
    }
  }, [game.phase, game.intermission, myPlayerId, spectate]);

  useEffect(() => subscribePlayerControl(() => orderSlip.resume()), []);

  useEffect(() => (playing ? lockPlayerControl() : undefined), [playing]);

  useFrame(({camera}) => {
    if (!playing) {
      return;
    }
    consumeLookDelta();
    const elapsed = performance.now() - playing.startedAt;
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
  }, FRAME_PRIORITY.camera);

  return null;
}
