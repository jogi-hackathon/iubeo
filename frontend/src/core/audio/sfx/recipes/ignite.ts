import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -14;

const LID_AT = 0.2;
const LID_HZ = [2100, 3050];
const LID_DB = -18;

const STRIKE_AT = 0.3;
const STRIKE_SECONDS = 0.06;
const STRIKE_HZ = 2600;
const STRIKE_GRAIN = 0.004;

const FLAME_AT = 0.34;
const FLAME_GROW = 0.22;
const FLAME_TAIL = 0.45;
const FLAME_FROM_HZ = 180;
const FLAME_PEAK_HZ = 700;
const FLAME_LEVEL = 0.9;

export const ignite: Recipe<"ignite"> = {
  id: "ignite",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lidAt = time + LID_AT;
            for (const hz of LID_HZ) {
              const ring = own(
                new Tone.Synth({
                  oscillator: {type: "sine"},
                  envelope: {
                    attack: 0.001,
                    decay: 0.09,
                    sustain: 0,
                    release: 0.02,
                  },
                  volume: LID_DB,
                }),
              ).connect(output);
              ring.triggerAttackRelease(hz, 0.05, lidAt);
            }

            const strike = own(new Tone.Gain(0)).connect(output);
            const strikeBand = own(
              new Tone.Filter({type: "bandpass", frequency: STRIKE_HZ, Q: 1}),
            ).connect(strike);
            const strikeNoise = own(new Tone.Noise("white")).connect(
              strikeBand,
            );
            const strikeAt = time + STRIKE_AT;
            strike.gain.setValueAtTime(0, strikeAt);
            for (let t = 0; t < STRIKE_SECONDS; t += STRIKE_GRAIN) {
              const shape = 1 - t / STRIKE_SECONDS;
              strike.gain.linearRampToValueAtTime(
                shape * (0.2 + Math.random() * 0.8) * 1.6,
                strikeAt + t,
              );
            }
            strike.gain.linearRampToValueAtTime(0, strikeAt + STRIKE_SECONDS);
            strikeNoise.start(strikeAt).stop(strikeAt + STRIKE_SECONDS + 0.01);

            const flameAt = time + FLAME_AT;
            const flameEnd = flameAt + FLAME_GROW + FLAME_TAIL;
            const flame = own(new Tone.Gain(0)).connect(output);
            const flameLow = own(
              new Tone.Filter({
                type: "lowpass",
                frequency: FLAME_FROM_HZ,
                Q: 0.7,
              }),
            ).connect(flame);
            const flameNoise = own(new Tone.Noise("pink")).connect(flameLow);
            flameLow.frequency.setValueAtTime(FLAME_FROM_HZ, flameAt);
            flameLow.frequency.exponentialRampToValueAtTime(
              FLAME_PEAK_HZ,
              flameAt + FLAME_GROW * 0.4,
            );
            flameLow.frequency.exponentialRampToValueAtTime(
              FLAME_FROM_HZ * 1.5,
              flameEnd,
            );
            flame.gain.setValueAtTime(0, flameAt);
            flame.gain.linearRampToValueAtTime(FLAME_LEVEL, flameAt + 0.03);
            flame.gain.exponentialRampToValueAtTime(
              FLAME_LEVEL * 0.3,
              flameAt + FLAME_GROW,
            );
            flame.gain.linearRampToValueAtTime(0, flameEnd);
            flameNoise.start(flameAt).stop(flameEnd + 0.01);

            const thump = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.04,
                octaves: 1.5,
                envelope: {attack: 0.004, decay: 0.12, sustain: 0},
                volume: -10,
              }),
            ).connect(output);
            thump.triggerAttackRelease(75, 0.1, flameAt);
          },
          time + FLAME_AT + FLAME_GROW + FLAME_TAIL,
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
