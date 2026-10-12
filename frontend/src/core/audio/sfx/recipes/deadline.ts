import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -20;
const PITCH_HZ = 660;
const WET = 0.1;

export const deadline: Recipe<"deadline"> = {
  id: "deadline",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(({output, own}) => {
          const tone = own(
            new Tone.Synth({
              oscillator: {type: "sine"},
              envelope: {attack: 0.003, decay: 0.06, sustain: 0, release: 0.03},
            }),
          ).connect(output);
          tone.triggerAttackRelease(PITCH_HZ, 0.02, time);
        }, time + 0.6);
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
