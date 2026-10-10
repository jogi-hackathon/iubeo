import type {TransformMessage} from "./types";

/** 送る位置と向き。position は足元のワールド座標、yaw / pitch はラジアン(フロントの Look と同じ規約) */
export type Pose = {
  position: readonly [number, number, number];
  yaw: number;
  pitch: number;
};

export type TransformSenderOptions = {
  /** 今の位置と向きを読む */
  read: () => Pose;
  /** 送る。送れたら true(SessionConnection.send) */
  send: (message: TransformMessage) => boolean;
  /** 送る間隔。既定は 50ms(20Hz) */
  intervalMs?: number;
  /** これ以下の変化は止まっているとみなす */
  epsilon?: number;
  /** テストで時間を進める用。既定は setInterval / clearInterval */
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

/**
 * 自分の位置と向きを、決まった間隔(既定 20Hz)で送る。前に送った物から変わっていなければ送らない。
 * seq は送るたびに増やす(サーバーは増えない更新を捨てる)。送れなかった物は送ったことにせず、次の間隔でまた送る
 */
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
