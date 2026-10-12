import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -8;
const CUT_HZ = 650;
const DECAY = 0.035;

export const key: Recipe<"key"> = {
  id: "key",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(({output, own}) => {
          const boost = own(new Tone.Gain(5)).connect(output);
          const band = own(
            new Tone.Filter({type: "bandpass", frequency: CUT_HZ, Q: 1.2}),
          ).connect(boost);
          const noise = own(
            new Tone.NoiseSynth({
              noise: {type: "pink"},
              envelope: {attack: 0.001, decay: DECAY, sustain: 0},
            }),
          ).connect(band);
          const tap = own(
            new Tone.MembraneSynth({
              pitchDecay: 0.01,
              octaves: 1,
              envelope: {attack: 0.001, decay: 0.03, sustain: 0},
              volume: -14,
            }),
          ).connect(output);
          band.frequency.setValueAtTime(
            CUT_HZ * (0.85 + Math.random() * 0.3),
            time,
          );
          noise.triggerAttackRelease(DECAY, time);
          tap.triggerAttackRelease(140, 0.03, time);
        }, time + 0.25);
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
