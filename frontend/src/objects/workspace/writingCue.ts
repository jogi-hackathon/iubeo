import type {WritingCue} from "../../core/audio/sfx/types";
import type {WritingScript} from "./writing";

export const toWritingCue = (
  script: WritingScript,
  startIn: number,
): WritingCue => ({
  beats: script.beats,
  lines: script.lines.map(({height, shaded}) => ({height, shaded})),
  startIn,
});
