import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -14;
const CUT_HZ = 1000;
const DECAY = 0.09;

export const filePick: Recipe<"filePick"> = {
  id: "filePick",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(({output, own}) => {
          const boost = own(new Tone.Gain(9)).connect(output);
          const band = own(
            new Tone.Filter({type: "bandpass", frequency: CUT_HZ, Q: 0.7}),
          ).connect(boost);
          const noise = own(
            new Tone.NoiseSynth({
              noise: {type: "pink"},
              envelope: {attack: 0.003, decay: DECAY, sustain: 0},
            }),
          ).connect(band);
          band.frequency.setValueAtTime(CUT_HZ, time);
          noise.triggerAttackRelease(DECAY, time);
        }, time + 0.3);
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
