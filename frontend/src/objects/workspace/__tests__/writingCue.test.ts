import {describe, expect, it} from "vitest";

import {createWritingScript} from "../writing";
import {toWritingCue} from "../writingCue";

describe("toWritingCue", () => {
  it("台本の拍をそのまま渡し、行は高さと網掛けだけにして、開始までの秒数を添える", () => {
    const script = createWritingScript(1, 1500);
    const cue = toWritingCue(script, 0.4);
    expect(cue.beats).toBe(script.beats);
    expect(cue.startIn).toBe(0.4);
    expect(cue.lines).toHaveLength(script.lines.length);
    expect(cue.lines[0]).toEqual({
      height: script.lines[0]!.height,
      shaded: script.lines[0]!.shaded,
    });
    expect(Object.keys(cue.lines[0]!).sort()).toEqual(["height", "shaded"]);
  });
});
