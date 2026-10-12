import {describe, expect, it, vi} from "vitest";

import {createPcPower} from "../power";

const setup = () => {
  let time = 0;
  const pending: Array<{fn: () => void; ms: number; cancelled: boolean}> = [];
  const power = createPcPower({
    now: () => time,
    schedule: (fn, ms) => {
      const entry = {fn, ms, cancelled: false};
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  });
  const advance = (ms: number) => {
    time += ms;
    for (const e of pending) {
      if (!e.cancelled && e.ms <= time) {
        e.cancelled = true;
        e.fn();
      }
    }
  };
  return {power, pending, advance};
};

describe("createPcPower", () => {
  it("初めは点いている", () => {
    const {power} = setup();
    expect(power.get()).toBe("on");
    expect(power.elapsed()).toBe(0);
  });

  it("落ちているときに boot すると、起動中を経て指定の時間で点く", () => {
    const {power, advance} = setup();
    power.turnOff();
    power.boot(4000);
    expect(power.get()).toBe("booting");
    advance(1000);
    expect(power.elapsed()).toBe(1000);
    advance(3000);
    expect(power.get()).toBe("on");
    expect(power.elapsed()).toBe(0);
  });

  it("起動中・点いているときの boot は何もしない", () => {
    const {power, pending} = setup();
    power.boot(4000);
    expect(power.get()).toBe("on");
    power.turnOff();
    power.boot(4000);
    power.boot(4000);
    expect(pending).toHaveLength(1);
  });

  it("起動中に落とすと、時間が過ぎても点かない", () => {
    const {power, advance} = setup();
    power.turnOff();
    power.boot(4000);
    power.turnOff();
    advance(5000);
    expect(power.get()).toBe("off");
  });

  it("変わったときだけ購読者へ知らせ、購読者が throw しても止まらない", () => {
    const {power} = setup();
    const listener = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    power.subscribe(() => {
      throw new Error("boom");
    });
    power.subscribe(listener);
    power.turnOn();
    expect(listener).not.toHaveBeenCalled();
    power.turnOff();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(power.get()).toBe("off");
    spy.mockRestore();
  });
});
