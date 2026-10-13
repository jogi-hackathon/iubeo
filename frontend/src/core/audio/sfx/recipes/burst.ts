import * as Tone from "../tone";

export type Burst = {
  output: Tone.Gain;
  own<T extends Tone.ToneAudioNode>(node: T): T;
};

export type BurstPool = {
  spawn(build: (burst: Burst) => void, endsAt: number): void;
  silence(time: number): void;
  dispose(): void;
};

const TAIL_SECONDS = 1;
const SILENCE_SECONDS = 0.02;

export const createBurstPool = (destination: Tone.InputNode): BurstPool => {
  const live = new Map<
    Tone.Gain,
    {nodes: Tone.ToneAudioNode[]; timer: number}
  >();

  const release = (output: Tone.Gain) => {
    const entry = live.get(output);
    if (!entry) {
      return;
    }
    Tone.getContext().clearTimeout(entry.timer);
    for (const node of entry.nodes) {
      node.dispose();
    }
    live.delete(output);
  };

  return {
    spawn(build, endsAt) {
      const output = new Tone.Gain(1).connect(destination);
      const nodes: Tone.ToneAudioNode[] = [output];
      const own = <T extends Tone.ToneAudioNode>(node: T): T => {
        nodes.push(node);
        return node;
      };
      build({output, own});
      const context = Tone.getContext();
      const delay = Math.max(0, endsAt - context.currentTime) + TAIL_SECONDS;
      const timer = context.setTimeout(() => release(output), delay);
      live.set(output, {nodes, timer});
    },
    silence(time) {
      for (const output of live.keys()) {
        output.gain.cancelScheduledValues(time);
        output.gain.setValueAtTime(output.gain.value, time);
        output.gain.linearRampToValueAtTime(0, time + SILENCE_SECONDS);
      }
    },
    dispose() {
      for (const output of live.keys()) {
        release(output);
      }
    },
  };
};
