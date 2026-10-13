import * as Tone from "../tone";
import type {Recipe} from "../types";

const LEVEL = -26;
const FADE_IN_SECONDS = 0.25;
const FADE_OUT_SECONDS = 0.15;

const BED_LOW_HZ = 320;
const BED_HIGH_HZ = 620;
const BED_SWAY_HZ = 0.8;
const BED_LEVEL = 1;

const CRACKLE_HZ = 1800;
const CRACKLE_LEVEL = 1.4;
const CRACKLES_PER_SECOND = 5;
const CRACKLE_GRAIN = 0.003;
const SCHEDULE_SECONDS = 0.2;

export const flame: Recipe<"flame"> = {
  id: "flame",
  make(out) {
    const context = Tone.getContext();
    const vol = new Tone.Volume(LEVEL).connect(out);
    const level = new Tone.Gain(0).connect(vol);

    const bedGain = new Tone.Gain(BED_LEVEL).connect(level);
    const bedLow = new Tone.Filter({
      type: "lowpass",
      frequency: BED_LOW_HZ,
      Q: 0.6,
    }).connect(bedGain);
    const bedNoise = new Tone.Noise("pink").connect(bedLow);
    const sway = new Tone.LFO(BED_SWAY_HZ, BED_LOW_HZ, BED_HIGH_HZ).connect(
      bedLow.frequency,
    );

    const crackle = new Tone.Gain(0).connect(level);
    const crackleBoost = new Tone.Gain(CRACKLE_LEVEL).connect(crackle);
    const crackleBand = new Tone.Filter({
      type: "bandpass",
      frequency: CRACKLE_HZ,
      Q: 1,
    }).connect(crackleBoost);
    const crackleNoise = new Tone.Noise("white").connect(crackleBand);

    let started = false;
    let running = false;
    let timer: number | null = null;
    let scheduledUntil = 0;

    const scheduleCrackles = () => {
      const now = context.currentTime;
      const until = now + SCHEDULE_SECONDS * 2;
      let at = Math.max(scheduledUntil, now + 0.02);
      while (true) {
        at += -Math.log(1 - Math.random()) / CRACKLES_PER_SECOND;
        if (at >= until) {
          break;
        }
        crackle.gain.setValueAtTime(0.2 + Math.random() * 0.8, at);
        crackle.gain.linearRampToValueAtTime(0, at + CRACKLE_GRAIN);
        scheduledUntil = at + CRACKLE_GRAIN;
      }
    };

    const rampLevel = (time: number, to: number, seconds: number) => {
      const from = level.gain.getValueAtTime(time);
      level.gain.cancelScheduledValues(time);
      level.gain.setValueAtTime(from, time);
      level.gain.linearRampToValueAtTime(to, time + seconds);
    };

    const stopScheduling = () => {
      if (timer !== null) {
        context.clearInterval(timer);
        timer = null;
      }
    };

    return {
      play(time) {
        if (running) {
          return;
        }
        running = true;
        if (!started) {
          started = true;
          bedNoise.start(time);
          crackleNoise.start(time);
          sway.start(time);
        }
        rampLevel(time, 1, FADE_IN_SECONDS);
        crackle.gain.cancelScheduledValues(time);
        crackle.gain.setValueAtTime(0, time);
        scheduledUntil = time;
        scheduleCrackles();
        timer = context.setInterval(scheduleCrackles, SCHEDULE_SECONDS);
      },
      stop(time) {
        if (!running) {
          return;
        }
        running = false;
        stopScheduling();
        rampLevel(time, 0, FADE_OUT_SECONDS);
        crackle.gain.cancelScheduledValues(time + FADE_OUT_SECONDS);
      },
      dispose() {
        stopScheduling();
        if (started) {
          bedNoise.stop();
          crackleNoise.stop();
          sway.stop();
        }
        for (const node of [
          bedNoise,
          bedLow,
          bedGain,
          sway,
          crackleNoise,
          crackleBand,
          crackleBoost,
          crackle,
          level,
          vol,
        ]) {
          node.dispose();
        }
      },
    };
  },
};
