import * as Tone from "../tone";
import type {Recipe} from "../types";

const LEVEL = -14;
const SPEED_HZ = 0.15;
const BASE_HZ = 70;
const OCTAVES = 2.5;
const FADE_SECONDS = 0.5;

export const window: Recipe<"window"> = {
  id: "window",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const level = new Tone.Gain(0).connect(vol);
    const filter = new Tone.AutoFilter({
      frequency: SPEED_HZ,
      baseFrequency: BASE_HZ,
      octaves: OCTAVES,
      filter: {type: "lowpass", rolloff: -24, Q: 0.8},
    })
      .connect(level)
      .start();
    const noise = new Tone.Noise("brown").connect(filter);

    let running = false;
    let started = false;

    return {
      play(time) {
        if (running) {
          return;
        }
        running = true;
        level.gain.cancelScheduledValues(time);
        level.gain.setValueAtTime(1, time);
        if (!started) {
          started = true;
          noise.start(time);
        }
      },
      stop(time) {
        if (!running) {
          return;
        }
        running = false;
        level.gain.cancelScheduledValues(time);
        level.gain.setValueAtTime(level.gain.value, time);
        level.gain.linearRampToValueAtTime(0, time + FADE_SECONDS);
      },
      dispose() {
        if (started) {
          noise.stop();
        }
        for (const node of [noise, filter, level, vol]) {
          node.dispose();
        }
      },
    };
  },
};
