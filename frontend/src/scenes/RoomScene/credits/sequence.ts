import type {CreditsPhase} from "./store";

export const ZOOM_SECONDS = 1.8;
export const GLITCH_MS = 450;
export const GLITCH_SWAP_SECONDS = 0.11;

export type CreditsStage =
  | "zoomIn"
  | "glitchIn"
  | "rolling"
  | "glitchOut"
  | "zoomOut";

export type CreditsSequence = {
  stage: CreditsStage;
  zoom: number;
  stageTime: number;
  roll: number;
};

export type SequenceEvents = {
  glitch: boolean;
  rollEnded: boolean;
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

export const boardVisible = (s: CreditsSequence): boolean =>
  s.stage === "rolling" ||
  (s.stage === "glitchOut" && s.stageTime < GLITCH_SWAP_SECONDS);

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
