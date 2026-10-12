import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -8;
const STEP = 0.022;
const LENGTH = 1.8;
const CUT_HZ = 900;

export const slip: Recipe<"slip"> = {
  id: "slip",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const band = own(
              new Tone.Filter({type: "bandpass", frequency: CUT_HZ, Q: 4}),
            ).connect(output);
            const tick = own(
              new Tone.NoiseSynth({
                noise: {type: "white"},
                envelope: {attack: 0.001, decay: 0.012, sustain: 0},
              }),
            ).connect(band);
            const motorLowpass = own(new Tone.Filter(160, "lowpass")).connect(
              output,
            );
            const motor = own(
              new Tone.Synth({
                oscillator: {type: "sawtooth"},
                envelope: {attack: 0.02, decay: 0, sustain: 1, release: 0.06},
                volume: -12,
              }),
            ).connect(motorLowpass);
            band.frequency.setValueAtTime(CUT_HZ, time);
            for (let k = 0; k * STEP < LENGTH; k++) {
              tick.triggerAttackRelease(0.012, time + k * STEP);
            }
            motor.triggerAttackRelease(50, LENGTH, time);
          },
          time + LENGTH + 0.3,
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
