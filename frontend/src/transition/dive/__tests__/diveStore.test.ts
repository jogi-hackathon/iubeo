import {describe, expect, it} from "vitest";

import {
  createDiveMachine,
  type DiveFrame,
  MIN_BOOT_TIME,
  returnDurationOf,
} from "../diveStore";

const DT = 1 / 60;
const D_COVER = 0.106;
const L = 0;

const make = () => createDiveMachine({dCover: D_COVER, L});

const run = (
  m: ReturnType<typeof make>,
  seconds: number,
  ready: (t: number) => boolean,
  each?: (f: DiveFrame, t: number) => void,
  returnDuration?: number,
) => {
  let t = 0;
  let last: DiveFrame | null = null;
  while (t < seconds) {
    last = m.step(DT, {ready: ready(t), returnDuration});
    t += DT;
    each?.(last, t);
    if (last.done) {
      break;
    }
  }
  return last!;
};

describe("createDiveMachine", () => {
  it("近いときは fly を省略して dive から始まる", () => {
    const m = make();
    m.start({flyDistance: 0.01, flyAngleDeg: 1});
    expect(m.phase).toBe("dive");
  });

  it("遠いときは fly から始まる", () => {
    const m = make();
    m.start({flyDistance: 3, flyAngleDeg: 0});
    expect(m.phase).toBe("fly");
    m.start({flyDistance: 0, flyAngleDeg: 10});
    expect(m.phase).toBe("fly");
  });

  it.each([
    ["hold 前から ready", () => true],
    ["hold 後に ready", (t: number) => t > 3],
  ])("%s でも switch -> done に到達する", (_, ready) => {
    const m = make();
    m.start({flyDistance: 2, flyAngleDeg: 30});
    const seen = new Set<string>();
    const last = run(m, 20, ready, (f) => seen.add(f.phase));
    expect(last.done).toBe(true);
    expect(last.d).toBeCloseTo(-L);
    expect(m.phase).toBe("idle");
    for (const p of ["fly", "dive", "portal", "switch"]) {
      expect(seen.has(p)).toBe(true);
    }
  });

  it("hold 中 d は 0.03 を下回らず減少する", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    let prev = Infinity;
    run(
      m,
      30,
      () => false,
      (f) => {
        if (f.phase !== "portal") {
          return;
        }
        expect(f.d).toBeGreaterThanOrEqual(0.03);
        expect(f.d).toBeLessThanOrEqual(prev);
        expect(f.blend).toBe(1);
        prev = f.d;
      },
    );
    expect(prev).toBeLessThan(0.04);
  });

  it("待機 0.8s 以上でグリッチ要求が 1.5s ごと", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    const times: number[] = [];
    let portalStart = -1;
    run(
      m,
      6,
      () => false,
      (f, t) => {
        if (f.phase === "portal" && portalStart < 0) {
          portalStart = t;
        }
        if (f.glitch) {
          times.push(t - portalStart);
        }
      },
    );
    expect(times.length).toBe(3);
    expect(times[0]!).toBeGreaterThanOrEqual(0.8 - 1e-6);
    expect(times[0]!).toBeLessThan(0.8 + 2 * DT);
    expect(times[1]! - times[0]!).toBeCloseTo(1.5, 1);
    expect(times[2]! - times[1]!).toBeCloseTo(1.5, 1);
  });

  it("switch 開始でグリッチ、blend は 1 から 0 へ", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    const frames: DiveFrame[] = [];
    run(
      m,
      20,
      () => true,
      (f) => frames.push(f),
    );
    const sw = frames.filter((f) => f.phase === "switch");
    expect(sw[0]!.glitch).toBe(true);
    expect(sw[0]!.blend).toBe(1);
    expect(sw[sw.length - 1]!.blend).toBeLessThan(0.1);
    const last = frames[frames.length - 1]!;
    expect(last.done).toBe(true);
    expect(last.blend).toBe(0);
    expect(last.d).toBe(-L);
  });

  it("ずれが無ければ switch の終わりで終わり、return に入らない", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    const seen = new Set<string>();
    const last = run(
      m,
      20,
      () => true,
      (f) => seen.add(f.phase),
    );
    expect(last.done).toBe(true);
    expect(seen.has("return")).toBe(false);
  });

  it("ずれがあれば return で ease しながら 0 から 1 へ進み、指定の時間で終わる", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    const ts: number[] = [];
    let returnStart: number | null = null;
    let doneAt: number | null = null;
    run(
      m,
      20,
      () => true,
      (f, now) => {
        if (f.phase === "return") {
          returnStart ??= now;
          ts.push(f.returnT);
        }
        if (f.done) {
          doneAt = now;
          ts.push(f.returnT);
        }
      },
      0.8,
    );
    expect(ts[0]!).toBe(0);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]!).toBeGreaterThanOrEqual(ts[i - 1]!);
    }
    expect(ts[ts.length - 1]!).toBe(1);
    expect(doneAt! - returnStart!).toBeCloseTo(0.8, 1);
    const mid = ts[Math.floor(ts.length / 4)]!;
    expect(mid).toBeLessThan(0.25);
  });

  it("returnDurationOf はしきい値以下で 0、それ以外は 0.35〜1.2 秒", () => {
    expect(returnDurationOf(0.03, 1)).toBe(0);
    expect(returnDurationOf(0.06, 0)).toBeGreaterThanOrEqual(0.35);
    expect(returnDurationOf(0, 5)).toBeGreaterThanOrEqual(0.35);
    expect(returnDurationOf(10, 180)).toBe(1.2);
    expect(returnDurationOf(1, 30)).toBeGreaterThan(returnDurationOf(0.2, 0));
  });

  it("fly を省略しても dive の前に最低起動時間だけ待つ", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    let t = 0;
    let diveStartedAt: number | null = null;
    let bootAtDive = 0;
    run(
      m,
      3,
      () => false,
      (f, now) => {
        t = now;
        if (f.phase === "dive" && f.d < 0.36 && diveStartedAt === null) {
          diveStartedAt = now;
          bootAtDive = f.boot;
        }
      },
    );
    expect(diveStartedAt).not.toBeNull();
    expect(diveStartedAt!).toBeGreaterThanOrEqual(MIN_BOOT_TIME);
    expect(bootAtDive).toBeGreaterThan(0.7);
    expect(t).toBeGreaterThan(0);
  });

  it("起動は 0 から始まり、fly が長ければ待たない", () => {
    const m = make();
    m.start({flyDistance: 3, flyAngleDeg: 0});
    const first = m.step(DT, {ready: false});
    expect(first.on).toBeGreaterThan(0);
    expect(first.on).toBeLessThan(0.3);
    expect(first.boot).toBeLessThan(0.2);
    let diveAt: number | null = null;
    run(
      m,
      5,
      () => false,
      (f, now) => {
        if (f.phase === "dive" && diveAt === null) {
          diveAt = now;
        }
      },
    );
    expect(diveAt!).toBeLessThan(1.5);
  });

  it("crt は dive で 1 から 0 へ下がり、portal 到達時に on/boot/crt が確定する", () => {
    const m = make();
    m.start({flyDistance: 0, flyAngleDeg: 0});
    let prev = 1;
    run(
      m,
      10,
      () => false,
      (f) => {
        expect(f.crt).toBeLessThanOrEqual(prev);
        prev = f.crt;
        if (f.portalReached) {
          expect(f.crt).toBe(0);
          expect(f.on).toBe(1);
          expect(f.boot).toBe(1);
        }
      },
    );
    expect(prev).toBe(0);
  });
});
