import type {CreditsPhase} from "./store";

/** 一人称の目から窓の外まで寄る(と戻る)のにかける秒数 */
export const ZOOM_SECONDS = 1.8;
/** 切り替えのグリッチの長さ(ms)。チュートリアルで物が現れるときと同じ */
export const GLITCH_MS = 450;
/** グリッチを始めてから板を出し入れするまで(秒)。グリッチがいちばん強くなるところで切り替える */
export const GLITCH_SWAP_SECONDS = 0.11;

/**
 * クレジットの見せ方の段階。
 *
 * - zoomIn: 窓をくぐって外へ寄る。板はまだ出さない
 * - glitchIn: 寄り切ったところでグリッチを起こし、強くなったところで板を出す
 * - rolling: 板を流す。流し切ったら(何も映らなくなったら)グリッチなしで zoomOut へ
 * - glitchOut: 途中で抜けるとき(Esc)。グリッチを起こし、強くなったところで板を消す
 * - zoomOut: 一人称の目へ戻る。板はもう出さない
 */
export type CreditsStage =
  | "zoomIn"
  | "glitchIn"
  | "rolling"
  | "glitchOut"
  | "zoomOut";

export type CreditsSequence = {
  stage: CreditsStage;
  /** 0 = 一人称の目、1 = 窓の外 */
  zoom: number;
  /** いまの段階に入ってからの秒数(グリッチの出し入れに使う) */
  stageTime: number;
  /** 板を見せ始めてからの秒数 */
  roll: number;
};

export type SequenceEvents = {
  /** この瞬間にグリッチを起こす */
  glitch: boolean;
  /** 流し切った(グリッチなしで一人称へ戻り始める) */
  rollEnded: boolean;
  /** 一人称の目に戻り切った */
  finished: boolean;
};

export const INITIAL_SEQUENCE: CreditsSequence = {
  stage: "zoomIn",
  zoom: 0,
  stageTime: 0,
  roll: 0,
};

const enter = (s: CreditsSequence, stage: CreditsStage): CreditsSequence => ({
  ...s,
  stage,
  stageTime: 0,
});

/** 板を見せる段階か */
export const boardVisible = (s: CreditsSequence): boolean =>
  s.stage === "rolling" ||
  (s.stage === "glitchOut" && s.stageTime < GLITCH_SWAP_SECONDS);

/**
 * dt 秒進める。phase はストアの段階で、流している途中で leaving になったら(Esc)板をグリッチで消してから戻る。
 * 寄っている途中で leaving になったら、板は出ていないのでそのまま戻る
 */
export const stepSequence = (
  s: CreditsSequence,
  phase: CreditsPhase,
  dt: number,
  rollSeconds: number,
): {next: CreditsSequence; events: SequenceEvents} => {
  const events: SequenceEvents = {
    glitch: false,
    rollEnded: false,
    finished: false,
  };
  let next: CreditsSequence = {...s, stageTime: s.stageTime + dt};

  if (phase === "leaving") {
    if (next.stage === "zoomIn") {
      next = enter(next, "zoomOut");
    } else if (next.stage === "glitchIn" || next.stage === "rolling") {
      next = enter(next, "glitchOut");
      events.glitch = true;
    }
  }

  switch (next.stage) {
    case "zoomIn":
      next.zoom = Math.min(1, next.zoom + dt / ZOOM_SECONDS);
      if (next.zoom === 1) {
        next = enter(next, "glitchIn");
        events.glitch = true;
      }
      break;
    case "glitchIn":
      if (next.stageTime >= GLITCH_SWAP_SECONDS) {
        next = enter(next, "rolling");
      }
      break;
    case "rolling":
      next.roll += dt;
      if (next.roll >= rollSeconds) {
        // 流し切ったときは板がもう画面の外にあるので、グリッチなしでそのまま戻る
        next = enter(next, "zoomOut");
        events.rollEnded = true;
      }
      break;
    case "glitchOut":
      if (next.stageTime >= GLITCH_SWAP_SECONDS) {
        next = enter(next, "zoomOut");
      }
      break;
    case "zoomOut":
      next.zoom = Math.max(0, next.zoom - dt / ZOOM_SECONDS);
      if (next.zoom === 0) {
        events.finished = true;
      }
      break;
  }
  return {next, events};
};
