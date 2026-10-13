import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -16;
const PITCH_HZ = 440;
const GAP = 0.1;
const WET = 0.2;

export const done: Recipe<"done"> = {
  id: "done",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const tone = own(
              new Tone.Synth({
                oscillator: {type: "sine"},
                envelope: {
                  attack: 0.004,
                  decay: 0.14,
                  sustain: 0,
                  release: 0.05,
                },
              }),
            ).connect(output);
            tone.triggerAttackRelease(PITCH_HZ, 0.05, time);
            tone.triggerAttackRelease(PITCH_HZ, 0.05, time + GAP);
          },
          time + GAP + 0.9,
        );
      },
      stop(time) {
        pool.silence(time);
      },
      dispose() {
        pool.dispose();
        reverb.dispose();
        vol.dispose();
      },
    };
  },
};
