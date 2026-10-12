import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -8;
const TOTAL_SECONDS = 8;
const IGNITE_SECONDS = 2;
const FADE_RATIO = 0.25;
const CEILING_HZ = 2000;

const FIRE_FPS = 12;
const GRAINS_PER_STEP = 3;
const GRAIN_SECONDS = 0.006;
const CRACKLE_FROM_HZ = 1300;
const CRACKLE_TO_HZ = 350;
const CRACKLE_BITS = 4;
const CRACKLE_DRIVE = 2;

const BANDS = 12;
const BED_FROM_HZ = 900;
const BED_TO_HZ = 180;
const BED_LEVEL = 0.25;

const FLICKER_FPS = 6;
const FLICKER_RATIO = 0.3;
const FLICKER_PITCHES = [196, 262, 330];
const FLICKER_DB = -8;
const FLICKER_DROP = 0.35;

const intensity = (t: number): number =>
  Math.max(
    0,
    Math.min(1, t / IGNITE_SECONDS, (1 - t / TOTAL_SECONDS) / FADE_RATIO),
  );

const quantize = (value: number): number => {
  const steps = 2 ** CRACKLE_BITS;
  return Math.round(value * steps) / steps;
};

export const corrupt: Recipe<"corrupt"> = {
  id: "corrupt",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(({output, own}) => {
          const end = time + TOTAL_SECONDS;
          const ceiling = own(new Tone.Filter(CEILING_HZ, "lowpass")).connect(
            output,
          );

          const crush = own(new Tone.WaveShaper(quantize)).connect(ceiling);
          const crackle = own(new Tone.Gain(0)).connect(
            own(new Tone.Gain(CRACKLE_DRIVE)).connect(crush),
          );
          const crackleBand = own(
            new Tone.Filter({
              type: "bandpass",
              frequency: CRACKLE_FROM_HZ,
              Q: 0.8,
            }),
          ).connect(crackle);
          const crackleNoise = own(new Tone.Noise("white")).connect(
            crackleBand,
          );

          const bed = own(new Tone.Gain(0)).connect(ceiling);
          const bedLow = own(
            new Tone.Filter({type: "lowpass", frequency: BED_FROM_HZ, Q: 0.5}),
          ).connect(bed);
          const bedNoise = own(new Tone.Noise("pink")).connect(bedLow);

          const flicker = own(
            new Tone.Synth({
              oscillator: {type: "square"},
              envelope: {attack: 0.002, decay: 0.03, sustain: 0, release: 0.01},
              volume: FLICKER_DB,
            }),
          ).connect(ceiling);

          crackleBand.frequency.setValueAtTime(CRACKLE_FROM_HZ, time);
          crackleBand.frequency.exponentialRampToValueAtTime(
            CRACKLE_TO_HZ,
            end,
          );
          crackle.gain.setValueAtTime(0, time);
          const step = 1 / FIRE_FPS;
          for (let t = 0; t < TOTAL_SECONDS; t += step) {
            const level = intensity(t);
            const count = Math.round(
              GRAINS_PER_STEP * level * (0.4 + Math.random() * 0.6),
            );
            const offsets = Array.from(
              {length: count},
              () => Math.random() * (step - GRAIN_SECONDS),
            ).sort((a, b) => a - b);
            let last = t;
            for (const offset of offsets) {
              const at = Math.max(t + offset, last + GRAIN_SECONDS);
              if (at + GRAIN_SECONDS >= t + step) {
                break;
              }
              crackle.gain.setValueAtTime(
                level * (0.3 + Math.random() * 0.7),
                time + at,
              );
              crackle.gain.linearRampToValueAtTime(
                0,
                time + at + GRAIN_SECONDS,
              );
              last = at + GRAIN_SECONDS;
            }
          }

          bed.gain.setValueAtTime(0, time);
          for (let band = 0; band < BANDS; band++) {
            const t = (band / BANDS) * TOTAL_SECONDS;
            const hz =
              BED_FROM_HZ * (BED_TO_HZ / BED_FROM_HZ) ** (band / (BANDS - 1));
            bedLow.frequency.setValueAtTime(hz, time + t);
          }
          for (let t = step; t <= TOTAL_SECONDS; t += step) {
            bed.gain.linearRampToValueAtTime(
              intensity(t) * BED_LEVEL,
              time + t,
            );
          }
          bed.gain.linearRampToValueAtTime(0, end);

          for (let t = 0; t < TOTAL_SECONDS; t += 1 / FLICKER_FPS) {
            if (Math.random() < FLICKER_RATIO * intensity(t)) {
              const pitch =
                FLICKER_PITCHES[
                  Math.floor(Math.random() * FLICKER_PITCHES.length)
                ]!;
              const drop = 1 - (1 - FLICKER_DROP) * (t / TOTAL_SECONDS);
              flicker.triggerAttackRelease(pitch * drop, 0.03, time + t);
            }
          }

          crackleNoise.start(time).stop(end);
          bedNoise.start(time).stop(end);
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
