import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -30;
const BODY_HZ = 105;
const MUFFLE_HZ = 420;
const SCUFF_DECAY = 0.035;

export const step: Recipe<"step"> = {
  id: "step",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        const detune = 0.9 + Math.random() * 0.2;
        pool.spawn(({output, own}) => {
          const muffle = own(
            new Tone.Filter({type: "lowpass", frequency: MUFFLE_HZ, Q: 0.5}),
          ).connect(output);
          const scuff = own(
            new Tone.NoiseSynth({
              noise: {type: "brown"},
              envelope: {attack: 0.006, decay: SCUFF_DECAY, sustain: 0},
              volume: -2,
            }),
          ).connect(muffle);
          const body = own(
            new Tone.MembraneSynth({
              pitchDecay: 0.03,
              octaves: 1.5,
              envelope: {attack: 0.003, decay: 0.07, sustain: 0},
              volume: -2,
            }),
          ).connect(muffle);
          scuff.triggerAttackRelease(SCUFF_DECAY, time);
          body.triggerAttackRelease(BODY_HZ * detune, 0.05, time);
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
