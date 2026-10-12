import * as Tone from "../tone";
import type {Recipe} from "../types";
import {createBurstPool} from "./burst";
import {createReverb} from "./reverb";

const LEVEL = -10;
const PITCH_HZ = 110;
const GAP = 0.28;
const WET = 0.35;
const ROOM = 0.7;

export const match: Recipe<"match"> = {
  id: "match",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const reverb = createReverb(vol, WET, ROOM);
    const pool = createBurstPool(reverb.input);

    return {
      play(time) {
        pool.spawn(
          ({output, own}) => {
            const lowpass = own(new Tone.Filter(300, "lowpass")).connect(
              output,
            );
            const tone = own(
              new Tone.Synth({
                oscillator: {type: "sine"},
                envelope: {attack: 0.04, decay: 0.35, sustain: 0, release: 0.1},
              }),
            ).connect(lowpass);
            tone.triggerAttackRelease(PITCH_HZ, 0.1, time);
            tone.triggerAttackRelease(PITCH_HZ, 0.1, time + GAP);
          },
          time + GAP + 1.4,
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
