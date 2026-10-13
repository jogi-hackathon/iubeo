import * as Tone from "../tone";

export type Reverb = {
  input: Tone.Gain;
  dispose(): void;
};

export const createReverb = (
  out: Tone.InputNode,
  wet: number,
  room = 0.5,
  damp = 1800,
): Reverb => {
  const sampleRate = Tone.getContext().sampleRate;
  const length = Math.floor(sampleRate * (0.25 + room * 1.2));
  const impulse = new Float32Array(length);
  const smoothing = Math.exp((-2 * Math.PI * damp) / sampleRate);
  let y = 0;
  for (let i = 0; i < length; i++) {
    const envelope = Math.exp((-6 * i) / length);
    y = smoothing * y + (1 - smoothing) * (Math.random() * 2 - 1);
    impulse[i] = y * envelope;
  }
  const input = new Tone.Gain(1);
  const dryGain = new Tone.Gain(1 - wet).connect(out);
  const wetGain = new Tone.Gain(wet).connect(out);
  const convolver = new Tone.Convolver(
    Tone.ToneAudioBuffer.fromArray(impulse),
  ).connect(wetGain);
  input.connect(dryGain);
  input.connect(convolver);
  return {
    input,
    dispose() {
      input.dispose();
      dryGain.dispose();
      wetGain.dispose();
      convolver.dispose();
    },
  };
};
