import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -10;
const PITCH_HZ = 85;
const DECAY = 0.18;

export const save: Recipe<"save"> = {
  id: "save",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lowpass = own(new Tone.Filter(500, "lowpass")).connect(
              output,
            );
            const thud = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.03,
                octaves: 1.5,
                envelope: {
                  attack: 0.001,
                  decay: DECAY,
                  sustain: 0,
                  release: 0.05,
                },
              }),
            ).connect(lowpass);
            const band = own(
              new Tone.Filter({type: "bandpass", frequency: 400, Q: 1}),
            ).connect(output);
            const rustle = own(
              new Tone.NoiseSynth({
                noise: {type: "pink"},
                envelope: {attack: 0.005, decay: 0.06, sustain: 0},
                volume: -8,
              }),
            ).connect(band);
            thud.triggerAttackRelease(PITCH_HZ, DECAY, time);
            rustle.triggerAttackRelease(0.06, time);
          },
          time + DECAY + 0.3,
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
