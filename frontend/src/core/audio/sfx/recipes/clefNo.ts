import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -14;
const PITCH_HZ = 150;
const GAP = 0.13;
const WET = 0.2;

export const clefNo: Recipe<"clefNo"> = {
  id: "clefNo",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lowpass = own(new Tone.Filter(500, "lowpass")).connect(
              output,
            );
            const tone = own(
              new Tone.Synth({
                oscillator: {type: "triangle"},
                envelope: {
                  attack: 0.005,
                  decay: 0.12,
                  sustain: 0,
                  release: 0.05,
                },
              }),
            ).connect(lowpass);
            tone.triggerAttackRelease(PITCH_HZ, 0.09, time);
            tone.triggerAttackRelease(PITCH_HZ, 0.09, time + GAP);
          },
          time + GAP + 1,
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
