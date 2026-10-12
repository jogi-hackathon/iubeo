import {describe, expect, it, vi} from "vitest";

import {createPcLogo} from "../pcLogo";

const setup = () => {
  const pending: Array<{fn: () => void; ms: number; cancelled: boolean}> = [];
  const logo = createPcLogo({
    schedule: (fn, ms) => {
      const entry = {fn, ms, cancelled: false};
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  });
  const fire = () => {
    for (const e of pending) {
      if (!e.cancelled) {
        e.fn();
      }
    }
  };
  return {logo, pending, fire};
};

describe("createPcLogo", () => {
  it("show で表示し、指定の時間が過ぎると消える", () => {
    const {logo, pending, fire} = setup();
    expect(logo.isVisible()).toBe(false);
    logo.show(3000);
    expect(logo.isVisible()).toBe(true);
    expect(pending[0]?.ms).toBe(3000);
    fire();
    expect(logo.isVisible()).toBe(false);
  });

  it("表示中に show し直すと、前のタイマーを取り消して数え直す", () => {
    const {logo, pending, fire} = setup();
    logo.show(3000);
    logo.show(5000);
    expect(pending[0]?.cancelled).toBe(true);
    fire();
    expect(logo.isVisible()).toBe(false);
  });

  it("hide で即座に消え、変わったときだけ通知する", () => {
    const {logo} = setup();
    const listener = vi.fn();
    logo.subscribe(listener);
    logo.show(1000);
    logo.show(1000);
    expect(listener).toHaveBeenCalledTimes(1);
    logo.hide();
    logo.hide();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
