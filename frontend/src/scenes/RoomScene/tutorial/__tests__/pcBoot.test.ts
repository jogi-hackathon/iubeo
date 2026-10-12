import {describe, expect, it, vi} from "vitest";

import {createPcPower} from "../../../../objects/pc/power";
import {createPcSession} from "../../../../objects/pc/session";
import {linkPcBoot} from "../pcBoot";

const setup = ({completed = false}: {completed?: boolean} = {}) => {
  let time = 0;
  const timers: Array<{fn: () => void; at: number; done: boolean}> = [];
  const power = createPcPower({
    now: () => time,
    schedule: (fn, ms) => {
      const timer = {fn, at: time + ms, done: false};
      timers.push(timer);
      return () => {
        timer.done = true;
      };
    },
  });
  // 本物のプレイヤーの預かりや pointer lock には触らない
  const session = createPcSession({
    lock: () => () => {},
    suppressPointerLock: () => () => {},
    exitPointerLock: () => {},
    resumePointerLock: () => {},
  });
  const onBooted = vi.fn();
  const link = linkPcBoot({
    power,
    session,
    pcId: "pc-1",
    bootMs: 1000,
    completed: () => completed,
    onBooted,
  });
  const advance = (ms: number) => {
    time += ms;
    for (const timer of timers) {
      if (!timer.done && timer.at <= time) {
        timer.done = true;
        timer.fn();
      }
    }
  };
  return {power, session, link, onBooted, advance};
};

describe("linkPcBoot", () => {
  it("終える前は電源を落とし、部屋の PC を触ると起動して、点いたら知らせる", () => {
    const {power, session, link, onBooted, advance} = setup();
    link.sync("running");
    expect(power.get()).toBe("off");
    session.enter("pc-1", "virtual");
    expect(power.get()).toBe("booting");
    advance(1000);
    expect(power.get()).toBe("on");
    expect(onBooted).toHaveBeenCalledTimes(1);
  });

  it("ほかの PC を触っても起動しない", () => {
    const {power, session, link} = setup();
    link.sync("running");
    session.enter("pc-2", "virtual");
    expect(power.get()).toBe("off");
  });

  it("終えたことが保存されていれば、始まる前(idle)でも落とさない", () => {
    const {power, link} = setup({completed: true});
    link.sync("idle");
    expect(power.get()).toBe("on");
  });

  it("dev パネルの complete で点き、reset で落ちる", () => {
    const {power, link} = setup();
    link.sync("running");
    link.sync("completed");
    expect(power.get()).toBe("on");
    link.sync("idle");
    expect(power.get()).toBe("off");
  });

  it("起動中に部屋を出たら点けて戻し、そのあとは知らせない", () => {
    const {power, session, link, onBooted, advance} = setup();
    link.sync("running");
    session.enter("pc-1", "virtual");
    link.dispose();
    expect(power.get()).toBe("on");
    advance(1000);
    expect(onBooted).not.toHaveBeenCalled();
  });
});
