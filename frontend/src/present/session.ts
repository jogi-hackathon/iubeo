import {closeDevPanel} from "../core/debug/devPanel";
import {
  resumePointerLock,
  suppressPointerLock,
} from "../core/input/pointerLock";
import {lockPlayerControl} from "../core/playerControl";
import {overview} from "../objects/directory/overview";
import {localPlayer} from "../player/local";
import {spawnOf} from "../scenes";
import {credits} from "../scenes/RoomScene/credits/store";
import {tutorialManager} from "../scenes/RoomScene/tutorial/manager";
import {sceneManager, sceneTransitionManager} from "../scenes/sceneStore";
import {applySpawn} from "../scenes/spawn";
import {type DeckId, lastStepOf, stepIdOf} from "./script";
import {presentStore} from "./store";

let releaseControl: (() => void) | null = null;
let releasePointer: (() => void) | null = null;

const releaseAll = (): void => {
  releasePointer?.();
  releasePointer = null;
  releaseControl?.();
  releaseControl = null;
};

/** 黒い画面の裏で、ゲームを最初の部屋・チュートリアルの始めに戻しておく */
const resetGame = (): void => {
  tutorialManager.reset();
  if (sceneManager.getState().current !== "room") {
    // 部屋に入ったときの onEnter でスポーン位置に置かれる
    void sceneTransitionManager.goTo("room");
    return;
  }
  credits.reset();
  overview.reset();
  applySpawn(localPlayer, spawnOf("room"));
};

/** 技術パートの終わりに目を開けると最初の部屋にいるようにする(窓の外のクレジットで締めるため)。目を閉じきってから呼ぶ */
const enterRoomBehind = (): void => {
  if (sceneManager.getState().current !== "room") {
    void sceneTransitionManager.goTo("room");
  }
};

/** 黒い画面になった手順で、裏のゲームを整える */
const prepareBehind = (deck: DeckId, step: number): void => {
  if (deck === "tech" && stepIdOf(deck, step) !== "close") {
    enterRoomBehind();
  }
};

/**
 * dev パネル(または F9)から呼ぶ。プレイヤーの操作とポインターロックを止めて始める。
 * イントロは黒い画面から始め、裏でゲームを最初の部屋・チュートリアルの始めに戻す。
 * 技術パートはデモの画面のまま目を閉じるところから始める
 */
export const startPresentation = (deck: DeckId, step = 0): void => {
  if (presentStore.getState().active) {
    return;
  }
  closeDevPanel();
  if (document.pointerLockElement !== null) {
    document.exitPointerLock();
  }
  releaseControl = lockPlayerControl();
  releasePointer = suppressPointerLock();
  if (deck === "intro") {
    resetGame();
  }
  presentStore.start(deck, step);
  prepareBehind(deck, step);
};

/**
 * 次の手順へ。キー操作やクリックの中で呼ぶこと: 目を開ける手順に入るときにポインターロックを取り直すので、
 * ユーザー操作の最中でないとブラウザに断られる
 */
export const advancePresentation = (): void => {
  const state = presentStore.getState();
  if (!state.active || state.step >= lastStepOf(state.deck)) {
    return;
  }
  presentStore.next();
  prepareBehind(state.deck, state.step + 1);
  if (state.step + 1 === lastStepOf(state.deck)) {
    releasePointer?.();
    releasePointer = null;
    resumePointerLock();
  }
};

export const backPresentation = (): void => {
  presentStore.prev();
};

/** 目を開け終えたとき、または Esc で途中でやめたときに呼ぶ。ゲームはそのまま操作できる状態に戻る */
export const endPresentation = (): void => {
  releaseAll();
  presentStore.exit();
};
