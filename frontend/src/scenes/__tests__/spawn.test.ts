import {describe, expect, it} from "vitest";

import {spawnOf} from "..";
import {START_POSITION} from "../../player/constants";
import {createPlayerState} from "../../player/state";
import {SANDBOX_SPAWNS} from "../SandboxScene/layout";
import {applySpawn} from "../spawn";

describe("applySpawn", () => {
  it("位置・速度・向きをスポーン地点へ戻す", () => {
    const player = createPlayerState(10, 3, -7);
    player.velocity.set(1, 2, 3);
    player.onGround = true;
    player.yaw = 1.5;
    player.pitch = -0.4;

    applySpawn(player, {position: [0, 0.05, 0], yaw: 0.25});

    expect(player.position.toArray()).toEqual([0, 0.05, 0]);
    expect(player.velocity.toArray()).toEqual([0, 0, 0]);
    expect(player.onGround).toBe(false);
    expect(player.yaw).toBe(0.25);
    expect(player.pitch).toBe(0);
  });
});

describe("spawnOf", () => {
  it("room は床の上の専用のスポーン地点、未定義のシーンは START_POSITION・yaw 0", () => {
    expect(spawnOf("room")).toEqual({position: [0, 0.05, 0], yaw: 0});
    expect(spawnOf("test")).toEqual({position: [...START_POSITION], yaw: 0});
  });

  it("sandbox は区画 0 のスポーン地点(床の上で、中心のディレクトリの方を向く)", () => {
    expect(spawnOf("sandbox")).toEqual(SANDBOX_SPAWNS[0]);
    expect(spawnOf("sandbox").position[1]).toBeCloseTo(0.05);
    expect(spawnOf("sandbox").yaw).toBe(0);
  });
});
