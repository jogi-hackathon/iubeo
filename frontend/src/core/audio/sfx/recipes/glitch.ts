import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -18;
const DEFAULT_MS = 300;
const LENGTH_RATIO = 0.6;
const MAX_SECONDS = 0.25;
const PEAK = 0.25;
const STEP_SECONDS = 0.015;
const GRAIN_SECONDS = 0.005;
const MIN_HZ = 800;
const MAX_HZ = 2500;
const BITS = 3;
const DRIVE = 2;

const quantize = (value: number): number => {
  const steps = 2 ** BITS;
  return Math.round(value * steps) / steps;
};

const envelope = (u: number): number =>
  u < PEAK ? (u / PEAK) ** 2 : ((1 - u) / (1 - PEAK)) ** 2;

export const glitch: Recipe<"glitch"> = {
  id: "glitch",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time, ms = DEFAULT_MS) {
        const length = Math.min(MAX_SECONDS, (ms / 1000) * LENGTH_RATIO);
        pool.spawn(({output, own}) => {
          const end = time + length;
          const crush = own(new Tone.WaveShaper(quantize)).connect(output);
          const level = own(new Tone.Gain(0)).connect(
            own(new Tone.Gain(DRIVE)).connect(crush),
          );
          const band = own(
            new Tone.Filter({type: "bandpass", frequency: MAX_HZ, Q: 1.2}),
          ).connect(level);
          const noise = own(new Tone.Noise("white")).connect(band);

          for (let t = 0; t < length; t += STEP_SECONDS) {
            band.frequency.setValueAtTime(
              MIN_HZ * (MAX_HZ / MIN_HZ) ** Math.random(),
              time + t,
            );
          }
          level.gain.setValueAtTime(0, time);
          for (let t = 0; t < length; t += GRAIN_SECONDS) {
            const on = Math.random() < 0.7;
            level.gain.setValueAtTime(
              on ? envelope(t / length) * (0.4 + Math.random() * 0.6) : 0,
              time + t,
            );
          }
          level.gain.setValueAtTime(0, end);
          noise.start(time).stop(end + 0.01);
        }, time + length);
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
