import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -4;
const PITCH_HZ = 140;
const DISTORTION = 0.6;
const CUT_HZ = 1500;

const TOTAL_SECONDS = 8;
const FIRST_GAP = 0.9;
const LAST_GAP = 0.25;
const STUTTER_RATIOS = [1, 1.19, 0.84, 1.5, 1, 0.63];
const STUTTER_STEP = 0.026;
const STUTTER_NOTE = 0.018;

const stutterStarts = () => {
  const starts: number[] = [];
  for (let at = 0; at < TOTAL_SECONDS;) {
    starts.push(at);
    at += FIRST_GAP + (LAST_GAP - FIRST_GAP) * (at / TOTAL_SECONDS);
  }
  return starts;
};

export const corrupt: Recipe<"corrupt"> = {
  id: "corrupt",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(({output, own}) => {
          const lowpass = own(new Tone.Filter(CUT_HZ, "lowpass")).connect(
            output,
          );
          const distortion = own(
            new Tone.Distortion({distortion: DISTORTION, oversample: "2x"}),
          ).connect(lowpass);
          const synth = own(
            new Tone.Synth({
              oscillator: {type: "square"},
              envelope: {
                attack: 0.001,
                decay: 0.04,
                sustain: 0.6,
                release: 0.02,
              },
            }),
          ).connect(distortion);
          for (const start of stutterStarts()) {
            STUTTER_RATIOS.forEach((ratio, k) => {
              synth.triggerAttackRelease(
                PITCH_HZ * ratio * (0.95 + Math.random() * 0.1),
                STUTTER_NOTE,
                time + start + k * STUTTER_STEP,
              );
            });
          }
        }, time + TOTAL_SECONDS);
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
