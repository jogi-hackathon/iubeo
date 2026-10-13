import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -22;
const DEFAULT_AMOUNT = 0.5;
const MIN_GAIN = 0.35;

export const land: Recipe<"land"> = {
  id: "land",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time, amount = DEFAULT_AMOUNT) {
        const loud = MIN_GAIN + (1 - MIN_GAIN) * amount;
        pool.spawn(({output, own}) => {
          const scale = own(new Tone.Gain(loud)).connect(output);
          const boost = own(new Tone.Gain(4)).connect(scale);
          const low = own(new Tone.Filter(260, "lowpass")).connect(boost);
          const scuff = own(
            new Tone.NoiseSynth({
              noise: {type: "pink"},
              envelope: {attack: 0.003, decay: 0.1, sustain: 0},
            }),
          ).connect(low);
          const thud = own(
            new Tone.MembraneSynth({
              pitchDecay: 0.04,
              octaves: 2,
              envelope: {attack: 0.001, decay: 0.2, sustain: 0},
              volume: -3,
            }),
          ).connect(scale);
          scuff.triggerAttackRelease(0.1, time);
          thud.triggerAttackRelease(62 + amount * 14, 0.15, time);
        }, time + 0.5);
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
