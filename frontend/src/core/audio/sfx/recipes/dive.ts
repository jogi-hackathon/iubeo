import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -12;
const FROM_HZ = 60;
const TO_HZ = 220;
const LENGTH = 1.4;
const WET = 0.3;
const ROOM = 0.7;

export const dive: Recipe<"dive"> = {
  id: "dive",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET, ROOM);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const synth = own(
              new Tone.FMSynth({
                harmonicity: 2,
                modulationIndex: 3,
                oscillator: {type: "sine"},
                modulation: {type: "sine"},
                envelope: {attack: 0.3, decay: 0.2, sustain: 1, release: 0.6},
              }),
            ).connect(output);
            const sweep = own(new Tone.Filter(150, "lowpass")).connect(output);
            const wind = own(new Tone.Gain(0)).connect(sweep);
            const noise = own(new Tone.Noise("pink")).connect(wind);

            synth.triggerAttack(FROM_HZ, time);
            synth.frequency.exponentialRampToValueAtTime(TO_HZ, time + LENGTH);
            synth.triggerRelease(time + LENGTH);
            sweep.frequency.setValueAtTime(150, time);
            sweep.frequency.exponentialRampToValueAtTime(1400, time + LENGTH);
            wind.gain.setValueAtTime(0, time);
            wind.gain.linearRampToValueAtTime(0.5, time + LENGTH * 0.7);
            wind.gain.linearRampToValueAtTime(0, time + LENGTH + 0.3);
            noise.start(time).stop(time + LENGTH + 0.4);
          },
          time + LENGTH + 1.4,
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
