import * as Tone from "../tone";
import type {Recipe} from "../types";
import {type Burst, createBurstPool} from "./burst";

const LEVEL = -6.5;
const GRAIN_SECONDS = 0.002;
const SNAP_SECONDS = 0.022;
const FLAP_AFTER_SNAP = 0.006;
const QUIET_GRAIN = 0.05;
const LOUD_GRAIN_FLOOR = 0.35;

export type PaperSlide = {
  seconds: number;
  fromHz: number;
  toHz: number;
  q: number;
  peakAt: number;
  level: number;
  sparse: number;
  fiberHz: number;
  fiberLevel: number;
};

export type PaperSnap = {fromHz: number; toHz: number; db: number};

export type PaperHit = {hz: number; db: number; decay: number; cutHz: number};

const SLIDE: PaperSlide = {
  seconds: 0.2,
  fromHz: 700,
  toHz: 1300,
  q: 0.8,
  peakAt: 0.85,
  level: 0.6,
  sparse: 0.3,
  fiberHz: 2200,
  fiberLevel: 0.2,
};
const SNAP: PaperSnap = {fromHz: 1500, toHz: 400, db: -6};
const FLAP: PaperHit = {hz: 150, db: -14, decay: 0.05, cutHz: 500};

const slideShape = (u: number, peakAt: number): number =>
  u < peakAt
    ? Math.sin((u / peakAt) * (Math.PI / 2)) ** 2
    : Math.cos(((u - peakAt) / (1 - peakAt)) * (Math.PI / 2)) ** 2;

const grainAmp = (sparse: number): number => {
  const r = Math.random();
  if (r < sparse) {
    return QUIET_GRAIN;
  }
  const loud = (r - sparse) / (1 - sparse);
  return LOUD_GRAIN_FLOOR + loud * (1 - LOUD_GRAIN_FLOOR);
};

export const spawnSlide = (
  {output, own}: Burst,
  time: number,
  slide: PaperSlide,
): number => {
  const end = time + slide.seconds;

  const air = own(new Tone.Gain(0)).connect(output);
  const airBand = own(
    new Tone.Filter({type: "bandpass", frequency: slide.fromHz, Q: slide.q}),
  ).connect(air);
  const airNoise = own(new Tone.Noise("pink")).connect(airBand);

  const fiber = own(new Tone.Gain(0)).connect(output);
  const fiberBand = own(
    new Tone.Filter({type: "bandpass", frequency: slide.fiberHz, Q: 1.5}),
  ).connect(fiber);
  const fiberNoise = own(new Tone.Noise("white")).connect(fiberBand);

  airBand.frequency.setValueAtTime(slide.fromHz, time);
  airBand.frequency.exponentialRampToValueAtTime(slide.toHz, end);

  air.gain.setValueAtTime(0, time);
  fiber.gain.setValueAtTime(0, time);
  for (let t = GRAIN_SECONDS; t < slide.seconds; t += GRAIN_SECONDS) {
    const shape = slideShape(t / slide.seconds, slide.peakAt);
    air.gain.linearRampToValueAtTime(
      shape * slide.level * grainAmp(slide.sparse),
      time + t,
    );
    fiber.gain.linearRampToValueAtTime(
      shape * slide.fiberLevel * grainAmp(slide.sparse + 0.2),
      time + t,
    );
  }
  air.gain.linearRampToValueAtTime(0, end);
  fiber.gain.linearRampToValueAtTime(0, end);

  airNoise.start(time);
  fiberNoise.start(time);
  airNoise.stop(end + 0.01);
  fiberNoise.stop(end + 0.01);
  return end;
};

export const spawnSnap = (
  {output, own}: Burst,
  time: number,
  snap: PaperSnap,
) => {
  const cut = own(
    new Tone.Filter({type: "lowpass", frequency: snap.fromHz, Q: 0.7}),
  ).connect(output);
  const burst = own(
    new Tone.NoiseSynth({
      noise: {type: "white"},
      envelope: {attack: 0.0005, decay: SNAP_SECONDS, sustain: 0},
      volume: snap.db,
    }),
  ).connect(cut);
  cut.frequency.setValueAtTime(snap.fromHz, time);
  cut.frequency.exponentialRampToValueAtTime(snap.toHz, time + SNAP_SECONDS);
  burst.triggerAttackRelease(SNAP_SECONDS, time);
};

export const spawnHit = ({output, own}: Burst, time: number, hit: PaperHit) => {
  const cut = own(
    new Tone.Filter({type: "lowpass", frequency: hit.cutHz, Q: 0.5}),
  ).connect(output);
  const body = own(
    new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 1.2,
      envelope: {attack: 0.002, decay: hit.decay, sustain: 0},
      volume: hit.db,
    }),
  ).connect(cut);
  body.triggerAttackRelease(hit.hz, hit.decay, time);
};

export const filePick: Recipe<"filePick"> = {
  id: "filePick",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          (burst) => {
            const freed = spawnSlide(burst, time, SLIDE);
            spawnSnap(burst, freed, SNAP);
            spawnHit(burst, freed + FLAP_AFTER_SNAP, FLAP);
          },
          time + SLIDE.seconds + SNAP_SECONDS + FLAP.decay,
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
