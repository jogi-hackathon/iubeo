import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -5;
const SHARDS = 36;
const SPREAD = 0.9;
const DROP = 0.6;

const SHARD_DECAYS = [0.05, 0.08, 0.11, 0.14];
const SHARD_DELAY = 0.015;
const DROP_DELAY = 0.15;
const DROP_SECONDS = 1.4;
const RUMBLE_SECONDS = 2;

const shardOffsets = () =>
  Array.from({length: SHARDS}, () => Math.random() ** 2 * SPREAD).sort(
    (a, b) => a - b,
  );

export const shatter: Recipe<"shatter"> = {
  id: "shatter",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, 0.3, 0.4, 6000);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const crackHigh = own(
              new Tone.Filter({type: "highpass", frequency: 1800, Q: 0.7}),
            ).connect(output);
            const crackPeak = own(
              new Tone.Filter({
                type: "peaking",
                frequency: 4200,
                Q: 1,
                gain: 8,
              }),
            ).connect(crackHigh);
            const crack = own(
              new Tone.NoiseSynth({
                noise: {type: "white"},
                envelope: {attack: 0.001, decay: 0.07, sustain: 0},
              }),
            ).connect(crackPeak);
            const thump = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.02,
                octaves: 2,
                envelope: {
                  attack: 0.001,
                  decay: 0.14,
                  sustain: 0,
                  release: 0.05,
                },
                volume: -4,
              }),
            ).connect(output);
            const shards = SHARD_DECAYS.map((decay) =>
              own(
                new Tone.Synth({
                  oscillator: {type: "sine"},
                  envelope: {attack: 0.002, decay, sustain: 0, release: 0.03},
                  volume: -10,
                }),
              ).connect(output),
            );
            const dropLowpass = own(new Tone.Filter(350, "lowpass")).connect(
              output,
            );
            const dropGain = own(new Tone.Gain(DROP)).connect(dropLowpass);
            const drop = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.8,
                octaves: 3,
                envelope: {
                  attack: 0.01,
                  decay: DROP_SECONDS,
                  sustain: 0,
                  release: 0.2,
                },
              }),
            ).connect(dropGain);
            const rumbleLowpass = own(new Tone.Filter(200, "lowpass")).connect(
              dropGain,
            );
            const rumble = own(new Tone.Gain(0)).connect(rumbleLowpass);
            const noise = own(new Tone.Noise("brown")).connect(rumble);

            crack.triggerAttackRelease(0.07, time);
            thump.triggerAttackRelease(170, 0.12, time);
            shardOffsets().forEach((offset, k) => {
              const hz = 2600 + Math.random() * 4800;
              shards[k % shards.length]!.triggerAttackRelease(
                hz,
                0.01,
                time + SHARD_DELAY + offset,
                0.35 + 0.65 * (1 - offset / SPREAD),
              );
            });
            const dropAt = time + DROP_DELAY;
            drop.triggerAttackRelease(55, DROP_SECONDS, dropAt);
            rumble.gain.setValueAtTime(0, dropAt);
            rumble.gain.linearRampToValueAtTime(0.7, dropAt + 0.9);
            rumble.gain.linearRampToValueAtTime(0, dropAt + 1.9);
            noise.start(dropAt).stop(dropAt + RUMBLE_SECONDS);
          },
          time + SPREAD + RUMBLE_SECONDS,
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
