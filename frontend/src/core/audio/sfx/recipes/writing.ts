import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {beatPitch, thinBeats} from "./writingBeats";

const LEVEL = -18;
const GAP_MS = 70;
const NOISE = 1;
const ACCENT = 0.6;

const CLOUD_SECONDS = 0.018;
const NOTE_DELAY = 0.015;
const NOTE_SECONDS = 0.01;
const LOW_HEIGHT = 26;
const VOICE_COUNT = 4;

const sineSynth = (attack: number, decay: number, release: number) =>
  new Tone.Synth({
    oscillator: {type: "sine"},
    envelope: {attack, decay, sustain: 0, release},
  });

export const writing: Recipe<"writing"> = {
  id: "writing",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time, cue) {
        const beats = thinBeats(cue.beats, GAP_MS);
        const start = time + cue.startIn;
        const lastAt =
          cue.beats.length > 0 ? cue.beats[cue.beats.length - 1]!.at : 0;
        pool.spawn(
          ({output, own}) => {
            const band = own(
              new Tone.Filter({type: "bandpass", frequency: 1200, Q: 2}),
            ).connect(output);
            const cloudGain = own(new Tone.Gain(0.5 * NOISE)).connect(band);
            const cloud = own(
              new Tone.NoiseSynth({
                noise: {type: "pink"},
                envelope: {attack: 0.001, decay: CLOUD_SECONDS, sustain: 0},
              }),
            ).connect(cloudGain);
            const lowpass = own(new Tone.Filter(1400, "lowpass")).connect(
              output,
            );
            const voices = Array.from({length: VOICE_COUNT}, () =>
              own(sineSynth(0.003, 0.04, 0.02)).connect(lowpass),
            );
            const low = own(sineSynth(0.004, 0.1, 0.03)).connect(lowpass);
            const eos = own(sineSynth(0.005, 0.16, 0.05)).connect(lowpass);

            let voiceIndex = 0;
            beats.forEach((beat, i) => {
              const isLast = i === beats.length - 1;
              const line = cue.lines[beat.line];
              if (!line) {
                return;
              }
              const at = start + beat.at / 1000;
              const pitch = beatPitch(beat, line, isLast, ACCENT);
              const isLow = line.height >= LOW_HEIGHT;
              band.frequency.setValueAtTime(1600, at);
              band.frequency.exponentialRampToValueAtTime(
                pitch * 2,
                at + CLOUD_SECONDS,
              );
              cloud.triggerAttackRelease(CLOUD_SECONDS, at);
              const voice = isLast
                ? eos
                : isLow
                  ? low
                  : voices[voiceIndex++ % voices.length]!;
              voice.triggerAttackRelease(
                pitch,
                NOTE_SECONDS,
                at + NOTE_DELAY,
                isLow || isLast ? 1 : 0.7,
              );
            });
          },
          start + lastAt / 1000 + 0.5,
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
