import type {WritingBeat, WritingLine} from "../types";

export const thinBeats = (
  beats: readonly WritingBeat[],
  gapMs: number,
): WritingBeat[] => {
  const last = beats.length - 1;
  const kept: WritingBeat[] = [];
  let lastAt = -Infinity;
  let lastLine = -1;
  beats.forEach((beat, i) => {
    if (i !== last && beat.line === lastLine && beat.at - lastAt < gapMs) {
      return;
    }
    lastAt = beat.at;
    lastLine = beat.line;
    kept.push(beat);
  });
  return kept;
};

export const beatPitch = (
  beat: WritingBeat,
  line: WritingLine,
  isLast: boolean,
  accent: number,
): number => {
  if (isLast || line.height >= 44) {
    return 285;
  }
  if (line.height >= 26) {
    return 320;
  }
  const across = (beat.x / 1024 - 0.5) * 4 * accent;
  if (line.shaded) {
    return 330 * 2 ** ((across * 0.5) / 12);
  }
  return 380 * 2 ** (across / 12);
};
