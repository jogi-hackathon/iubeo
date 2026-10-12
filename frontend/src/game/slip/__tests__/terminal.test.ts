import {describe, expect, it} from "vitest";

import {SLIP_LENGTH} from "../strip";
import {
  PAPER_CURL,
  PAPER_STUB,
  PRINT_STEPS,
  SLIP_LOOK,
  STAGE_MS,
  stageStart,
  steppedFeed,
  STOW_MS,
  TERMINAL_BELOW,
  TERMINAL_HELD_TILT,
  TERMINAL_SEQUENCE_MS,
  TERMINAL_STAGES,
  terminalPose,
} from "../terminal";

describe("terminalPose", () => {
  it("段は定義の順に並び、合計が一連の長さになる", () => {
    let at = 0;
    for (const stage of TERMINAL_STAGES) {
      expect(stageStart(stage)).toBe(at);
      if (stage !== "done") {
        at += STAGE_MS[stage];
      }
    }
    expect(TERMINAL_SEQUENCE_MS).toBe(at);
  });

  it("持ち上げの間に視界の下から手の位置へ来て、傾きが落ち着く", () => {
    const start = terminalPose(0);
    expect(start.stage).toBe("raise");
    expect(start.device.y).toBeLessThan(-0.1);
    const end = terminalPose(STAGE_MS.raise);
    expect(end.device.y).toBeCloseTo(0);
    expect(end.device.tilt).toBeCloseTo(TERMINAL_HELD_TILT);
  });

  it("印刷が始まるまで紙は切れ端だけで、印刷中に 1 行ずつ伸びて最後に伝票の長さになる", () => {
    const before = terminalPose(stageStart("print") - 1);
    expect(before.paper.length).toBeCloseTo(PAPER_STUB);
    expect(before.paper.torn).toBe(false);

    let last = PAPER_STUB;
    for (let i = 0; i <= 100; i++) {
      const at = stageStart("print") + (STAGE_MS.print * i) / 100;
      const {length} = terminalPose(at).paper;
      expect(length).toBeGreaterThanOrEqual(last - 1e-9);
      last = length;
    }
    expect(terminalPose(stageStart("feed")).paper.length).toBeCloseTo(
      SLIP_LENGTH,
    );
  });

  it("行送りはコマ送り: 行の切り替わり直後に一気に進み、行の終わりで止まる", () => {
    const step = 1 / PRINT_STEPS;
    expect(steppedFeed(0)).toBe(0);
    expect(steppedFeed(1)).toBe(1);
    expect(steppedFeed(step)).toBeCloseTo(step);
    const early = steppedFeed(step * 0.25);
    expect(early).toBeGreaterThan(step * 0.5);
    expect(steppedFeed(step * 0.9)).toBeCloseTo(step, 2);
  });

  it("印刷中だけ端末が震える", () => {
    expect(
      terminalPose(stageStart("print") + 10).device.jitter,
    ).toBeGreaterThan(0);
    expect(terminalPose(stageStart("receive")).device.jitter).toBe(0);
    expect(terminalPose(stageStart("look")).device.jitter).toBe(0);
  });

  it("千切ると紙は端末から離れ、見る位置へ進み、巻きがほどける", () => {
    const tearing = terminalPose(stageStart("tear") + STAGE_MS.tear * 0.3);
    expect(tearing.paper.torn).toBe(true);
    expect(tearing.paper.tearTilt).toBeGreaterThan(0);
    expect(tearing.paper.toLook).toBeGreaterThan(0);
    expect(tearing.paper.toLook).toBeLessThan(1);

    const looking = terminalPose(stageStart("look") + STAGE_MS.look);
    expect(looking.paper.toLook).toBe(1);
    expect(looking.paper.tearTilt).toBeCloseTo(0);
    expect(looking.paper.curl).toBeCloseTo(PAPER_CURL.rest);
    expect(looking.paper.length).toBeCloseTo(SLIP_LENGTH);
  });

  it("見ている間は端末が下がり、飛ぶ段で伝票は手を離れ、端末は前半で視界の下へしまう", () => {
    const looking = terminalPose(stageStart("look") + STAGE_MS.look - 1);
    expect(looking.device.y).toBeLessThan(0);
    expect(looking.paper.stow).toBe(0);
    expect(looking.paper.launched).toBe(false);
    const stowing = terminalPose(stageStart("fly") + STOW_MS / 2);
    expect(stowing.stage).toBe("fly");
    expect(stowing.paper.launched).toBe(true);
    expect(stowing.paper.stow).toBeGreaterThan(0);
    expect(stowing.paper.stow).toBeLessThan(1);
    const stowed = terminalPose(stageStart("fly") + STOW_MS);
    expect(stowed.paper.stow).toBeCloseTo(1);
    expect(stowed.device.y).toBeCloseTo(TERMINAL_BELOW.y);
    const done = terminalPose(TERMINAL_SEQUENCE_MS + 1000);
    expect(done.stage).toBe("done");
    expect(done.paper.launched).toBe(true);
    expect(done.paper.toLook).toBe(1);
  });

  it("画面は段ごとに変わり、印刷中の進みは紙の長さに合わせて 0 → 1", () => {
    expect(terminalPose(0).screen.status).toBe("ready");
    expect(terminalPose(stageStart("receive")).screen.status).toBe("receiving");
    const printing = terminalPose(stageStart("print") + STAGE_MS.print / 2);
    expect(printing.screen.status).toBe("printing");
    expect(printing.screen.progress).toBeGreaterThan(0.3);
    expect(printing.screen.progress).toBeLessThan(0.7);
    expect(terminalPose(stageStart("feed")).screen.status).toBe("tear");
    expect(terminalPose(stageStart("look")).screen.status).toBe("done");
  });

  it("伝票を見る位置は目(手の座標系で上の手前)の側にある", () => {
    expect(SLIP_LOOK.center[2]).toBeGreaterThan(0);
    expect(SLIP_LOOK.center[1]).toBeGreaterThan(0);
  });
});
