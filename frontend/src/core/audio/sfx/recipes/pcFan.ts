import * as Tone from "../tone";
import type {Recipe} from "../types";

const LEVEL = -28;
const WHINE_HZ = 1500;
const WHINE_AMOUNT = 0.3;
const BLADE_HZ = 150;
const CHORD = 0.15;
const HISS = 0.1;

const SPIN_UP_SECONDS = 1.2;
const SPIN_DOWN_SECONDS = 0.9;
const START_PITCH = 0.6;
const RESONANCE_HZ = 3400;

const PARTIALS = [
  {ratio: 1, gain: 1, rate: 0.13},
  {ratio: 1.5, gain: 0.5, rate: 0.21},
  {ratio: 2.02, gain: 0.45, rate: 0.34},
  {ratio: 2.76, gain: 0.3, rate: 0.27},
  {ratio: 3.9, gain: 0.2, rate: 0.19},
  {ratio: 5.3, gain: 0.12, rate: 0.41},
];

type Holdable<V> = {
  value: V;
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: V, time: number): unknown;
  cancelAndHoldAtTime?(time: number): unknown;
};

const holdFrom = <V>(param: Holdable<V>, time: number) => {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
};

export const pcFan: Recipe<"pcFan"> = {
  id: "pcFan",
  make(out) {
    const vol = new Tone.Volume(LEVEL).connect(out);
    const fan = new Tone.Gain(0).connect(vol);
    const hissBand = new Tone.Filter({
      type: "bandpass",
      frequency: 1800,
      Q: 0.8,
    }).connect(fan);
    const hissGain = new Tone.Gain(0.5 * HISS).connect(hissBand);
    const resonanceBand = new Tone.Filter({
      type: "bandpass",
      frequency: RESONANCE_HZ,
      Q: 8,
    }).connect(fan);
    const resonanceGain = new Tone.Gain(0.6 * HISS).connect(resonanceBand);
    const flutter = new Tone.Tremolo({frequency: 0.4, depth: 0.12}).start();
    flutter.connect(hissGain);
    flutter.connect(resonanceGain);
    const air = new Tone.Noise("white").connect(flutter);

    const whineGain = new Tone.Gain(0.06 * WHINE_AMOUNT).connect(fan);
    const whine = new Tone.Oscillator(WHINE_HZ, "sine").connect(whineGain);
    const wobble = new Tone.LFO({frequency: 1.7, min: -9, max: 9}).start();
    wobble.connect(whine.detune);

    const bladeBus = new Tone.Gain(0.05);
    const bladeChain = [
      new Tone.Filter({type: "peaking", frequency: 320, Q: 6, gain: 9}),
      new Tone.Filter({type: "peaking", frequency: 760, Q: 6, gain: 9}),
      new Tone.Filter(2500, "lowpass"),
    ];
    bladeBus.chain(...bladeChain, fan);
    const blades = PARTIALS.map(({ratio, gain, rate}, i) => {
      const partialGain = new Tone.Gain(
        ratio === 1 ? gain : gain * CHORD,
      ).connect(bladeBus);
      const osc = new Tone.Oscillator(
        BLADE_HZ * ratio,
        i < 2 ? "triangle" : "sine",
      ).connect(partialGain);
      const drift = new Tone.LFO({frequency: rate, min: -6, max: 6}).start();
      drift.connect(osc.detune);
      return {osc, partialGain, drift, hz: BLADE_HZ * ratio};
    });

    const pitched = [
      {frequency: whine.frequency, hz: WHINE_HZ},
      {frequency: resonanceBand.frequency, hz: RESONANCE_HZ},
      ...blades.map((blade) => ({
        frequency: blade.osc.frequency,
        hz: blade.hz,
      })),
    ];

    const sources = [air, whine, ...blades.map((blade) => blade.osc)];

    let running = false;
    let started = false;

    return {
      play(time) {
        if (running) {
          return;
        }
        running = true;
        for (const {frequency, hz} of pitched) {
          frequency.cancelScheduledValues(time);
          frequency.setValueAtTime(hz * START_PITCH, time);
          frequency.exponentialRampToValueAtTime(hz, time + SPIN_UP_SECONDS);
        }
        fan.gain.cancelScheduledValues(time);
        fan.gain.setValueAtTime(0, time);
        fan.gain.linearRampToValueAtTime(1, time + SPIN_UP_SECONDS);
        if (!started) {
          started = true;
          for (const source of sources) {
            source.start(time);
          }
        }
      },
      stop(time) {
        if (!running) {
          return;
        }
        running = false;
        const end = time + SPIN_DOWN_SECONDS;
        holdFrom(fan.gain, time);
        fan.gain.linearRampToValueAtTime(0, end);
        for (const {frequency, hz} of pitched) {
          if (frequency === resonanceBand.frequency) {
            continue;
          }
          holdFrom(frequency, time);
          frequency.exponentialRampToValueAtTime(hz * START_PITCH, end);
        }
      },
      dispose() {
        if (started) {
          for (const source of sources) {
            source.stop();
          }
        }
        for (const node of [
          air,
          whine,
          wobble,
          flutter,
          vol,
          fan,
          hissBand,
          hissGain,
          resonanceBand,
          resonanceGain,
          whineGain,
          bladeBus,
          ...bladeChain,
        ]) {
          node.dispose();
        }
        for (const blade of blades) {
          blade.osc.dispose();
          blade.partialGain.dispose();
          blade.drift.dispose();
        }
      },
    };
  },
};
