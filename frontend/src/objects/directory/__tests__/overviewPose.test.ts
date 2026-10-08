import {Quaternion, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {
  MOUNTAIN_HEIGHT_MAX,
  mountainHeightMax,
  mountainReach,
  mountainViewHeight,
  VIEW_HEIGHT,
} from "../mountain";
import {
  computeOverviewPose,
  OVERVIEW_HEIGHT,
  overviewHeight,
  overviewQuaternion,
} from "../overviewPose";

describe("computeOverviewPose", () => {
  it("山の中心の真上に置き、山頂(最大の高さ)より上にする", () => {
    const pose = computeOverviewPose([3, 1, -3], 0.7);
    expect(pose.position[0]).toBe(3);
    expect(pose.position[2]).toBe(-3);
    expect(pose.position[1]).toBeCloseTo(1 + OVERVIEW_HEIGHT);
    expect(OVERVIEW_HEIGHT).toBeGreaterThanOrEqual(MOUNTAIN_HEIGHT_MAX + 1.5);
    expect(OVERVIEW_HEIGHT).toBeGreaterThanOrEqual(VIEW_HEIGHT);
  });
});

describe("overviewHeight", () => {
  it("large は OVERVIEW_HEIGHT と同じ。small は低いが、山頂より上で、俯瞰に要る高さ以上", () => {
    expect(overviewHeight("large")).toBe(OVERVIEW_HEIGHT);
    const small = overviewHeight("small");
    expect(small).toBeLessThan(overviewHeight("large"));
    expect(small).toBeGreaterThanOrEqual(mountainHeightMax("small") + 1.5);
    expect(small).toBeGreaterThanOrEqual(mountainViewHeight("small"));
    // 山の端まで(縦の画角 75 度の 90% 以内)が画面に収まる
    expect(mountainReach("small") / small).toBeLessThan(
      0.9 * Math.tan((75 / 2) * (Math.PI / 180)),
    );
  });

  it("computeOverviewPose は size で高さが変わる(省略は large)", () => {
    expect(computeOverviewPose([3, 1, -3], 0).position[1]).toBeCloseTo(
      1 + overviewHeight("large"),
    );
    const small = computeOverviewPose([3, 1, -3], 0, "small");
    expect(small.position).toEqual([3, 1 + overviewHeight("small"), -3]);
  });
});

describe("overviewQuaternion", () => {
  it("どの yaw でも、真下を向き、画面の上方向がプレイヤーの向きになる(NaN も跳びも無い)", () => {
    for (const yaw of [0, 0.5, Math.PI / 2, Math.PI, -2.3, 10]) {
      const q = overviewQuaternion(
        computeOverviewPose([0, 0, 0], yaw),
        new Quaternion(),
      );
      expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
      expect(q.length()).toBeCloseTo(1);
      const forward = new Vector3(0, 0, -1).applyQuaternion(q);
      const up = new Vector3(0, 1, 0).applyQuaternion(q);
      expect(forward.x).toBeCloseTo(0);
      expect(forward.y).toBeCloseTo(-1);
      expect(forward.z).toBeCloseTo(0);
      // 一人称の水平の前方 (-sin yaw, -cos yaw)
      expect(up.x).toBeCloseTo(-Math.sin(yaw));
      expect(up.y).toBeCloseTo(0);
      expect(up.z).toBeCloseTo(-Math.cos(yaw));
    }
  });
});
