import {describe, expect, it, vi} from "vitest";

import {createTransformSender, type Pose} from "../transformSender";
import type {TransformMessage} from "../types";

const setup = () => {
  let pose: Pose = {position: [0, 0, 0], yaw: 0, pitch: 0};
  let connected = true;
  const sent: TransformMessage[] = [];
  let tick: (() => void) | null = null;
  const stop = vi.fn();
  const sender = createTransformSender({
    read: () => pose,
    send: (m) => {
      if (!connected) {
        return false;
      }
      sent.push(m);
      return true;
    },
    every: (fn, ms) => {
      expect(ms).toBe(50);
      tick = fn;
      return stop;
    },
  });
  return {
    sender,
    sent,
    stop,
    tick: () => tick?.(),
    move: (next: Partial<Pose>) => {
      pose = {...pose, ...next};
    },
    setConnected: (v: boolean) => {
      connected = v;
    },
  };
};

describe("createTransformSender", () => {
  it("最初は送り、動いていなければ送らない", () => {
    const {sender, sent, tick, move} = setup();
    sender.start();
    tick();
    tick();
    move({yaw: 1});
    tick();
    expect(sent.map((m) => [m.seq, m.yaw])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it("epsilon 以下の変化は動いていないとみなす", () => {
    const {sender, sent, tick, move} = setup();
    sender.start();
    tick();
    move({position: [0.00001, 0, 0]});
    tick();
    move({position: [0.1, 0, 0]});
    tick();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.position).toEqual([0.1, 0, 0]);
  });

  it("送れなかったときは seq を進めず、次の間隔で送り直す", () => {
    const {sender, sent, tick, setConnected} = setup();
    sender.start();
    setConnected(false);
    tick();
    setConnected(true);
    tick();
    expect(sent.map((m) => m.seq)).toEqual([1]);
  });

  it("syncSeq はサーバーの seq に合わせ、小さい値では戻さず、次は必ず送る", () => {
    const {sender, sent, tick} = setup();
    sender.start();
    tick();
    sender.syncSeq(128);
    tick();
    sender.syncSeq(3);
    tick();
    expect(sent.map((m) => m.seq)).toEqual([1, 129, 130]);
  });

  it("start は二重に始めず、stop で止める", () => {
    const {sender, stop} = setup();
    sender.start();
    sender.start();
    sender.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
