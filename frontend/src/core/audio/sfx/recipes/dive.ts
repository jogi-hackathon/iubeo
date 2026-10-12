import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -20;
const LENGTH = 1.6;
const FADE_IN = 0.06;
const FADE_OUT = 0.3;
const LOW_CUT_HZ = 180;
const HIGH_CUT_HZ = 7000;
const GRAIN_SECONDS = 0.002;
const GRAIN_DEPTH = 0.3;

const shape = (t: number): number =>
  Math.max(0, Math.min(1, t / FADE_IN, (LENGTH - t) / FADE_OUT));

export const dive: Recipe<"dive"> = {
  id: "dive",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const end = time + LENGTH;
            const level = own(new Tone.Gain(0)).connect(output);
            const high = own(
              new Tone.Filter({
                type: "lowpass",
                frequency: HIGH_CUT_HZ,
                Q: 0.5,
              }),
            ).connect(level);
            const low = own(
              new Tone.Filter({
                type: "highpass",
                frequency: LOW_CUT_HZ,
                Q: 0.5,
              }),
            ).connect(high);
            const noise = own(new Tone.Noise("white")).connect(low);

            level.gain.setValueAtTime(0, time);
            for (let t = GRAIN_SECONDS; t < LENGTH; t += GRAIN_SECONDS) {
              level.gain.linearRampToValueAtTime(
                shape(t) * (1 - GRAIN_DEPTH * Math.random()),
                time + t,
              );
            }
            level.gain.linearRampToValueAtTime(0, end);
            noise.start(time).stop(end + 0.02);
          },
          time + LENGTH + 0.1,
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
