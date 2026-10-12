import * as Tone from "../tone";
import type {Recipe, SlipCue} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -8;
const DEFAULT_CUE: SlipCue = {
  printSeconds: 1.8,
  feedSeconds: 0.25,
  tearSeconds: 0.35,
};

const STEP = 0.022;
const CUT_HZ = 900;

const FEED_RUSTLE_HZ = 1500;

const TEAR_FROM_HZ = 1400;
const TEAR_TO_HZ = 3000;
const TEAR_GRAIN = 0.003;
const TEAR_RATIO = 0.75;
const TEAR_LEVEL = 1;
const RUSTLE_LEVEL = 0.25;

export const slip: Recipe<"slip"> = {
  id: "slip",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time, cue = DEFAULT_CUE) {
        const {printSeconds, feedSeconds, tearSeconds} = cue;
        const feedAt = time + printSeconds;
        const tearAt = feedAt + feedSeconds;
        const end = tearAt + tearSeconds;
        pool.spawn(({output, own}) => {
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
          for (let k = 0; k * STEP < printSeconds; k++) {
            tick.triggerAttackRelease(0.012, time + k * STEP);
          }
          motor.triggerAttackRelease(50, printSeconds + feedSeconds, time);

          const rustleGain = own(new Tone.Gain(0)).connect(output);
          const rustle = own(new Tone.Noise("pink")).connect(
            own(
              new Tone.Filter({
                type: "bandpass",
                frequency: FEED_RUSTLE_HZ,
                Q: 0.8,
              }),
            ).connect(rustleGain),
          );
          rustleGain.gain.setValueAtTime(0, feedAt);
          rustleGain.gain.linearRampToValueAtTime(RUSTLE_LEVEL, feedAt + 0.03);
          rustleGain.gain.linearRampToValueAtTime(0, tearAt);
          rustle.start(feedAt).stop(tearAt + 0.02);

          const ripLength = tearSeconds * TEAR_RATIO;
          const ripGain = own(new Tone.Gain(0)).connect(output);
          const ripBand = own(
            new Tone.Filter({
              type: "bandpass",
              frequency: TEAR_FROM_HZ,
              Q: 0.9,
            }),
          ).connect(ripGain);
          const rip = own(new Tone.Noise("white")).connect(ripBand);
          ripBand.frequency.setValueAtTime(TEAR_FROM_HZ, tearAt);
          ripBand.frequency.exponentialRampToValueAtTime(
            TEAR_TO_HZ,
            tearAt + ripLength,
          );
          ripGain.gain.setValueAtTime(0, tearAt);
          for (let t = TEAR_GRAIN; t < ripLength; t += TEAR_GRAIN) {
            const u = t / ripLength;
            const swell = Math.sin(Math.PI * u) ** 0.6;
            ripGain.gain.linearRampToValueAtTime(
              TEAR_LEVEL * swell * (0.2 + Math.random() * 0.8),
              tearAt + t,
            );
          }
          ripGain.gain.linearRampToValueAtTime(0, tearAt + ripLength);
          rip.start(tearAt).stop(tearAt + ripLength + 0.02);
        }, end);
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
