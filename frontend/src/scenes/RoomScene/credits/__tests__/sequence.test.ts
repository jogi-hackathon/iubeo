import {describe, expect, it} from "vitest";

import {
  boardVisible,
  type CreditsSequence,
  GLITCH_SWAP_SECONDS,
  INITIAL_SEQUENCE,
  type SequenceEvents,
  stepSequence,
  ZOOM_SECONDS,
} from "../sequence";
import type {CreditsPhase} from "../store";

const DT = 1 / 60;
const ROLL = 10;

const run = (s: CreditsSequence, phase: CreditsPhase, seconds: number) => {
  const seen: SequenceEvents = {
    glitch: false,
    rollEnded: false,
    finished: false,
  };
  let glitches = 0;
  for (let t = 0; t < seconds; t += DT) {
    const {next, events} = stepSequence(s, phase, DT, ROLL);
    s = next;
    glitches += events.glitch ? 1 : 0;
    seen.glitch ||= events.glitch;
    seen.rollEnded ||= events.rollEnded;
    seen.finished ||= events.finished;
  }
  return {s, seen, glitches};
};

describe("stepSequence", () => {
  it("寄っている間は板を出さない", () => {
    const {s, seen} = run(INITIAL_SEQUENCE, "active", ZOOM_SECONDS * 0.9);
    expect(s.stage).toBe("zoomIn");
    expect(boardVisible(s)).toBe(false);
    expect(seen.glitch).toBe(false);
  });

  it("寄り切ったらグリッチを 1 度起こし、強くなったところで板を出す", () => {
    const {s, glitches} = run(INITIAL_SEQUENCE, "active", ZOOM_SECONDS + 0.05);
    expect(s.zoom).toBe(1);
    expect(glitches).toBe(1);
    expect(boardVisible(s)).toBe(false);
    const shown = run(s, "active", GLITCH_SWAP_SECONDS + 0.05).s;
    expect(shown.stage).toBe("rolling");
    expect(boardVisible(shown)).toBe(true);
  });

  it("流し切ったら知らせ、グリッチなしで一人称へ戻る", () => {
    const shown = run(INITIAL_SEQUENCE, "active", ZOOM_SECONDS + 1).s;
    const ended = run(shown, "active", ROLL);
    expect(ended.seen.rollEnded).toBe(true);
    expect(ended.s.stage).toBe("zoomOut");
    expect(boardVisible(ended.s)).toBe(false);

    const back = run(ended.s, "leaving", ZOOM_SECONDS + 0.1);
    expect(back.glitches).toBe(0);
    expect(back.seen.finished).toBe(true);
  });

  it("leaving になったら、グリッチで板を消してから一人称へ戻り、戻り切ったら知らせる", () => {
    const shown = run(INITIAL_SEQUENCE, "active", ZOOM_SECONDS + 1).s;
    const glitched = run(shown, "leaving", DT);
    expect(glitched.seen.glitch).toBe(true);
    expect(glitched.s.zoom).toBe(1);

    const hidden = run(glitched.s, "leaving", GLITCH_SWAP_SECONDS + 0.05).s;
    expect(hidden.stage).toBe("zoomOut");
    expect(boardVisible(hidden)).toBe(false);

    const back = run(hidden, "leaving", ZOOM_SECONDS + 0.1);
    expect(back.s.zoom).toBe(0);
    expect(back.seen.finished).toBe(true);
    expect(back.glitches).toBe(0);
  });

  it("寄っている途中で leaving になったら、グリッチなしでそのまま戻る", () => {
    const half = run(INITIAL_SEQUENCE, "active", ZOOM_SECONDS / 2).s;
    const back = run(half, "leaving", ZOOM_SECONDS);
    expect(back.glitches).toBe(0);
    expect(back.seen.finished).toBe(true);
  });
});
