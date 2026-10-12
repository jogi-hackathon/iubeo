import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -6;
const PITCH_HZ = 260;
const LENGTH = 1.4;
const MODULATION = 10;
const WET = 0.3;
const ROOM = 0.6;

export const canvas: Recipe<"canvas"> = {
  id: "canvas",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET, ROOM);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lowpass = own(new Tone.Filter(1200, "lowpass")).connect(
              output,
            );
            const synth = own(
              new Tone.FMSynth({
                harmonicity: 1.5,
                modulationIndex: MODULATION,
                oscillator: {type: "sine"},
                modulation: {type: "sine"},
                envelope: {attack: 0.5, decay: 0.3, sustain: 0.5, release: 0.7},
                modulationEnvelope: {
                  attack: 0.01,
                  decay: LENGTH * 0.8,
                  sustain: 0,
                  release: 0.3,
                },
              }),
            ).connect(lowpass);
            synth.triggerAttackRelease(PITCH_HZ, LENGTH, time);
          },
          time + LENGTH + 1.2,
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
