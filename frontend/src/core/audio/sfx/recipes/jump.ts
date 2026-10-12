import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";

const LEVEL = -26;
const FROM_HZ = 260;
const TO_HZ = 520;
const SWEEP_SECONDS = 0.14;

export const jump: Recipe<"jump"> = {
  id: "jump",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const pool = createBurstPool(vol);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const boost = own(new Tone.Gain(5)).connect(output);
            const level = own(new Tone.Gain(0)).connect(boost);
            const band = own(
              new Tone.Filter({type: "bandpass", frequency: FROM_HZ, Q: 0.6}),
            ).connect(level);
            const noise = own(new Tone.Noise("pink")).connect(band);
            const push = own(
              new Tone.MembraneSynth({
                pitchDecay: 0.03,
                octaves: 1.5,
                envelope: {attack: 0.001, decay: 0.1, sustain: 0},
                volume: -12,
              }),
            ).connect(output);
            const end = time + SWEEP_SECONDS + 0.06;

            band.frequency.setValueAtTime(FROM_HZ, time);
            band.frequency.exponentialRampToValueAtTime(
              TO_HZ,
              time + SWEEP_SECONDS,
            );
            level.gain.setValueAtTime(0, time);
            level.gain.linearRampToValueAtTime(0.5, time + 0.05);
            level.gain.linearRampToValueAtTime(0, end);
            noise.start(time);
            noise.stop(end);
            push.triggerAttackRelease(95, 0.09, time);
          },
          time + SWEEP_SECONDS + 0.3,
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
