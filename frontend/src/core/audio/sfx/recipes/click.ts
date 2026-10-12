import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -10;
const DOWN_HZ = 760;
const UP_HZ = 620;
const DECAY = 0.014;

export const click: Recipe<"click"> = {
  id: "click",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time, phase) {
        const up = phase === "up";
        pool.spawn(({output, own}) => {
          const boost = own(new Tone.Gain(up ? 3 : 6)).connect(output);
          const band = own(
            new Tone.Filter({
              type: "bandpass",
              frequency: up ? UP_HZ : DOWN_HZ,
              Q: 1.4,
            }),
          ).connect(boost);
          const noise = own(
            new Tone.NoiseSynth({
              noise: {type: "pink"},
              envelope: {attack: 0.001, decay: DECAY, sustain: 0},
            }),
          ).connect(band);
          const tap = own(
            new Tone.MembraneSynth({
              pitchDecay: 0.008,
              octaves: 1,
              envelope: {attack: 0.001, decay: 0.02, sustain: 0},
              volume: up ? -22 : -14,
            }),
          ).connect(output);
          noise.triggerAttackRelease(DECAY, time);
          tap.triggerAttackRelease(up ? 170 : 210, 0.02, time);
        }, time + 0.2);
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
