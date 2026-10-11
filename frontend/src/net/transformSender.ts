import type {TransformMessage} from "./types";

export type Pose = {
  position: readonly [number, number, number];
  yaw: number;
  pitch: number;
};

export type TransformSenderOptions = {
  read: () => Pose;
  send: (message: TransformMessage) => boolean;
  intervalMs?: number;
  epsilon?: number;
  every?: (fn: () => void, ms: number) => () => void;
};

const defaultEvery = (fn: () => void, ms: number): (() => void) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

const moved = (a: Pose, b: Pose, epsilon: number): boolean =>
  Math.abs(a.yaw - b.yaw) > epsilon ||
  Math.abs(a.pitch - b.pitch) > epsilon ||
  a.position.some((v, i) => Math.abs(v - (b.position[i] ?? 0)) > epsilon);

export const createTransformSender = ({
  read,
  send,
  intervalMs = 50,
  epsilon = 1e-4,
  every = defaultEvery,
}: TransformSenderOptions) => {
  let seq = 0;
  let lastSent: Pose | null = null;
  let stopTimer: (() => void) | null = null;

  const tick = () => {
    const pose = read();
    if (lastSent && !moved(pose, lastSent, epsilon)) {
      return;
    }
    const next = seq + 1;
    const ok = send({
      type: "transform",
      seq: next,
      position: [...pose.position],
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
    if (ok) {
      seq = next;
      lastSent = {...pose, position: [...pose.position]};
    }
  };

  return {
    start: () => {
      stopTimer ??= every(tick, intervalMs);
    },
    stop: () => {
      stopTimer?.();
      stopTimer = null;
    },
    syncSeq: (serverSeq: number) => {
      seq = Math.max(seq, serverSeq);
      lastSent = null;
    },
  };
};

export type TransformSender = ReturnType<typeof createTransformSender>;
