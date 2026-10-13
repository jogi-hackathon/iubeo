import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -14;
const PITCH_HZ = 520;
const DECAY = 0.22;
const WET = 0.25;

export const clefOk: Recipe<"clefOk"> = {
  id: "clefOk",
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
                  decay: DECAY,
                  sustain: 0,
                  release: 0.05,
                },
              }),
            ).connect(output);
            tone.triggerAttackRelease(PITCH_HZ, 0.05, time);
          },
          time + DECAY + 1,
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
