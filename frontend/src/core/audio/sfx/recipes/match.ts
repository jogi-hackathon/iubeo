import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -20;
const PITCH_HZ = 1046;
const BEEPS = 3;
const BEEP_SECONDS = 0.06;
const GAP = 0.11;
const CUT_HZ = 3000;

export const match: Recipe<"match"> = {
  id: "match",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lowpass = own(new Tone.Filter(CUT_HZ, "lowpass")).connect(
              output,
            );
            const beep = own(
              new Tone.Synth({
                oscillator: {type: "square"},
                envelope: {
                  attack: 0.002,
                  decay: 0,
                  sustain: 1,
                  release: 0.01,
                },
                volume: -6,
              }),
            ).connect(lowpass);
            for (let k = 0; k < BEEPS; k++) {
              beep.triggerAttackRelease(PITCH_HZ, BEEP_SECONDS, time + k * GAP);
            }
          },
          time + BEEPS * GAP + 0.2,
        );
      },
      stop(time) {
        pool.silence(time);
      },
      dispose() {
        pool.dispose();
        vol.dispose();
      },
    };
  },
};
