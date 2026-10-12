import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -5;
const DRIVE = 0.35;

const CRACK_DECAY = 0.03;
const CRACK_LOW_CUT_HZ = 700;
const CRACK_PEAK_HZ = 2400;

const PUNCH_HZ = 62;
const PUNCH_DECAY = 0.18;

const TAIL_SECONDS = 0.35;
const TAIL_CUT_HZ = 900;
const TAIL_LEVEL = 0.35;

const DECAY_AT = 0.02;
const DECAY_SECONDS = 1.1;
const CEILING_HZ = 2000;

const GRID_FPS = 24;
const GRAINS_PER_STEP = 3;
const GRAIN_SECONDS = 0.006;
const CRACKLE_FROM_HZ = 1300;
const CRACKLE_TO_HZ = 350;
const CRACKLE_BITS = 4;
const CRACKLE_DRIVE = 2;

const BANDS = 8;
const BED_FROM_HZ = 900;
const BED_TO_HZ = 180;
const BED_LEVEL = 0.3;

const BLIP_FPS = 12;
const BLIP_RATIO = 0.4;
const BLIP_PITCHES = [196, 262, 330];
const BLIP_DROP = 0.35;
const BLIP_DB = -8;

const decay = (u: number): number => (1 - u) ** 1.5;

const quantize = (value: number): number => {
  const steps = 2 ** CRACKLE_BITS;
  return Math.round(value * steps) / steps;
};

export const shatter: Recipe<"shatter"> = {
  id: "shatter",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, 0.2, 0.35, 2500);
    const drive = new Tone.Distortion({
      distortion: DRIVE,
      oversample: "2x",
    }).connect(reverb.input);
    const pool = createBurstPool(drive);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const crackHigh = own(
              new Tone.Filter({
                type: "highpass",
                frequency: CRACK_LOW_CUT_HZ,
                Q: 0.7,
              }),
            ).connect(output);
            const crackPeak = own(
              new Tone.Filter({
                type: "peaking",
                frequency: CRACK_PEAK_HZ,
                Q: 0.9,
                gain: 6,
              }),
            ).connect(crackHigh);
            const crack = own(
              new Tone.NoiseSynth({
                noise: {type: "white"},
                envelope: {attack: 0.0005, decay: CRACK_DECAY, sustain: 0},
              }),
            ).connect(crackPeak);

            const punch = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.03,
                octaves: 3,
                envelope: {
                  attack: 0.0005,
                  decay: PUNCH_DECAY,
                  sustain: 0,
                  release: 0.05,
                },
                volume: 0,
              }),
            ).connect(output);

            const tail = own(new Tone.Gain(0)).connect(output);
            const tailLow = own(
              new Tone.Filter(TAIL_CUT_HZ, "lowpass"),
            ).connect(tail);
            const tailNoise = own(new Tone.Noise("pink")).connect(tailLow);
            const tailAt = time + 0.005;
            tail.gain.setValueAtTime(TAIL_LEVEL, tailAt);
            tail.gain.exponentialRampToValueAtTime(
              0.001,
              tailAt + TAIL_SECONDS,
            );
            tailNoise.start(tailAt).stop(tailAt + TAIL_SECONDS + 0.02);

            const startAt = time + DECAY_AT;
            const endAt = startAt + DECAY_SECONDS;
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
            crackleBand.frequency.setValueAtTime(CRACKLE_FROM_HZ, startAt);
            crackleBand.frequency.exponentialRampToValueAtTime(
              CRACKLE_TO_HZ,
              endAt,
            );

            crackle.gain.setValueAtTime(0, startAt);
            const step = 1 / GRID_FPS;
            for (let t = 0; t < DECAY_SECONDS; t += step) {
              const level = decay(t / DECAY_SECONDS);
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
                  startAt + at,
                );
                crackle.gain.linearRampToValueAtTime(
                  0,
                  startAt + at + GRAIN_SECONDS,
                );
                last = at + GRAIN_SECONDS;
              }
            }

            const bed = own(new Tone.Gain(0)).connect(ceiling);
            const bedLow = own(
              new Tone.Filter({
                type: "lowpass",
                frequency: BED_FROM_HZ,
                Q: 0.5,
              }),
            ).connect(bed);
            const bedNoise = own(new Tone.Noise("pink")).connect(bedLow);
            for (let band = 0; band < BANDS; band++) {
              const hz =
                BED_FROM_HZ * (BED_TO_HZ / BED_FROM_HZ) ** (band / (BANDS - 1));
              bedLow.frequency.setValueAtTime(
                hz,
                startAt + (band / BANDS) * DECAY_SECONDS,
              );
            }
            bed.gain.setValueAtTime(BED_LEVEL, startAt);
            for (let t = step; t <= DECAY_SECONDS; t += step) {
              bed.gain.linearRampToValueAtTime(
                BED_LEVEL * decay(t / DECAY_SECONDS),
                startAt + t,
              );
            }
            bed.gain.linearRampToValueAtTime(0, endAt);

            const blip = own(
              new Tone.Synth({
                oscillator: {type: "square"},
                envelope: {
                  attack: 0.002,
                  decay: 0.03,
                  sustain: 0,
                  release: 0.01,
                },
                volume: BLIP_DB,
              }),
            ).connect(ceiling);
            for (let t = 0; t < DECAY_SECONDS; t += 1 / BLIP_FPS) {
              const u = t / DECAY_SECONDS;
              if (Math.random() < BLIP_RATIO * decay(u)) {
                const pitch =
                  BLIP_PITCHES[
                    Math.floor(Math.random() * BLIP_PITCHES.length)
                  ]!;
                blip.triggerAttackRelease(
                  pitch * (1 - (1 - BLIP_DROP) * u),
                  0.03,
                  startAt + t,
                );
              }
            }

            crackleNoise.start(startAt).stop(endAt);
            bedNoise.start(startAt).stop(endAt);

            crack.triggerAttackRelease(CRACK_DECAY, time);
            punch.triggerAttackRelease(PUNCH_HZ, 0.15, time);
          },
          time + DECAY_AT + DECAY_SECONDS + 0.1,
        );
      },
      stop(time) {
        pool.silence(time);
      },
      dispose() {
        pool.dispose();
        drive.dispose();
        reverb.dispose();
        vol.dispose();
      },
    };
  },
};
