import * as Tone from "../tone";
import type {Recipe} from "../types";

const DEFAULT_AMOUNT = 0.5;
const LEVEL = -40;
const LOW_HZ = 1500;
const HIGH_HZ = 2800;
const ATTACK_SECONDS = 0.03;
const HOLD_SECONDS = 0.08;
const RELEASE_SECONDS = 0.07;

export const swipe: Recipe<"swipe"> = {
  id: "swipe",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const level = new Tone.Gain(0).connect(vol);
    const band = new Tone.Filter({
      type: "bandpass",
      frequency: LOW_HZ,
      Q: 0.8,
    }).connect(level);
    const noise = new Tone.Noise("white").connect(band);

    let started = false;

    return {
      play(time, amount = DEFAULT_AMOUNT) {
        if (!started) {
          started = true;
          noise.start(time);
        }
        level.gain.cancelScheduledValues(time);
        level.gain.setTargetAtTime(amount, time, ATTACK_SECONDS);
        level.gain.setTargetAtTime(0, time + HOLD_SECONDS, RELEASE_SECONDS);
        band.frequency.cancelScheduledValues(time);
        band.frequency.setTargetAtTime(
          LOW_HZ + (HIGH_HZ - LOW_HZ) * amount,
          time,
          ATTACK_SECONDS,
        );
      },
      stop(time) {
        level.gain.cancelScheduledValues(time);
        level.gain.setTargetAtTime(0, time, 0.02);
      },
      dispose() {
        if (started) {
          noise.stop();
        }
        for (const node of [noise, band, level, vol]) {
          node.dispose();
        }
      },
    };
  },
};
