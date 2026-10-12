import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {
  type PaperHit,
  type PaperSlide,
  type PaperSnap,
  spawnHit,
  spawnSlide,
  spawnSnap,
} from "./filePick";

const LEVEL = -8;
const SETTLE_AFTER_STOP = 0.004;

const ENTRY: PaperSnap = {fromHz: 1600, toHz: 600, db: -16};
const SLIDE: PaperSlide = {
  seconds: 0.17,
  fromHz: 1300,
  toHz: 600,
  q: 0.8,
  peakAt: 0.2,
  level: 0.55,
  sparse: 0.3,
  fiberHz: 2200,
  fiberLevel: 0.15,
};
const STOP: PaperHit = {hz: 110, db: -8, decay: 0.09, cutHz: 400};
const SETTLE: PaperSlide = {
  seconds: 0.08,
  fromHz: 900,
  toHz: 600,
  q: 0.8,
  peakAt: 0.2,
  level: 0.22,
  sparse: 0.25,
  fiberHz: 2000,
  fiberLevel: 0.06,
};

export const save: Recipe<"save"> = {
  id: "save",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          (burst) => {
            spawnSnap(burst, time, ENTRY);
            const landed = spawnSlide(burst, time, SLIDE);
            spawnHit(burst, landed, STOP);
            spawnSlide(burst, landed + SETTLE_AFTER_STOP, SETTLE);
          },
          time + SLIDE.seconds + Math.max(STOP.decay, SETTLE.seconds),
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
