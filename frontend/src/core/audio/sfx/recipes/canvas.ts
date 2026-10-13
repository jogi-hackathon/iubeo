import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -20;
const LENGTH = 1.6;
const FROM_HZ = 7000;
const TO_HZ = 3500;
const LOW_CUT_HZ = 180;
const FROM_LEVEL = 1;
const HOLD = 0.55;
const TO_LEVEL = 0.3;
const GRAIN_SECONDS = 0.002;
const GRAIN_DEPTH = 0.35;
const ATTACK_SECONDS = 0.03;
const FADE_SECONDS = 0.3;
const WET = 0.25;
const ROOM = 0.5;

const bodyLevel = (u: number): number =>
  u < HOLD
    ? FROM_LEVEL
    : FROM_LEVEL + (TO_LEVEL - FROM_LEVEL) * ((u - HOLD) / (1 - HOLD));

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
            const level = own(new Tone.Gain(0)).connect(output);
            const highpass = own(
              new Tone.Filter({
                type: "highpass",
                frequency: LOW_CUT_HZ,
                Q: 0.5,
              }),
            ).connect(level);
            const lowpass = own(
              new Tone.Filter({type: "lowpass", frequency: FROM_HZ, Q: 0.5}),
            ).connect(highpass);
            const noise = own(new Tone.Noise("white")).connect(lowpass);
            const end = time + LENGTH + FADE_SECONDS;

            lowpass.frequency.setValueAtTime(FROM_HZ, time);
            lowpass.frequency.exponentialRampToValueAtTime(
              TO_HZ,
              time + LENGTH,
            );

            level.gain.setValueAtTime(0, time);
            level.gain.linearRampToValueAtTime(
              FROM_LEVEL,
              time + ATTACK_SECONDS,
            );
            for (
              let t = ATTACK_SECONDS + GRAIN_SECONDS;
              t < LENGTH;
              t += GRAIN_SECONDS
            ) {
              const grain = 1 - GRAIN_DEPTH * Math.random();
              level.gain.linearRampToValueAtTime(
                bodyLevel(t / LENGTH) * grain,
                time + t,
              );
            }
            level.gain.linearRampToValueAtTime(0, end);

            noise.start(time);
            noise.stop(end);
          },
          time + LENGTH + FADE_SECONDS + 1,
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
