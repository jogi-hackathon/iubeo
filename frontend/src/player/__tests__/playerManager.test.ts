import {afterEach, describe, expect, it, vi} from "vitest";

import {createPlayerManager, INTERPOLATION_DELAY_MS} from "../playerManager";
import {createPlayerState} from "../state";
import type {PlayerStatus, PlayerTransform} from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

const status = (
  playerId: string,
  overrides: Partial<PlayerStatus> = {},
): PlayerStatus => ({
  playerId,
  kind: "human",
  seat: 1,
  connection: "connected",
  life: "alive",
  heldItem: null,
  ...overrides,
});

const transform = (
  seq: number,
  x = 0,
  overrides: Partial<PlayerTransform> = {},
): PlayerTransform => ({
  position: [x, 0, 0],
  yaw: 0,
  pitch: 0,
  seq,
  ...overrides,
});

const make = (initialMe: string | null = null) => {
  let time = 1000;
  let me = initialMe;
  const manager = createPlayerManager({now: () => time, myPlayerId: () => me});
  return {
    manager,
    at: (ms: number) => {
      time = ms;
    },
    setMe: (id: string | null) => {
      me = id;
    },
  };
};

describe("createPlayerManager", () => {
  it("初期状態はプレイヤーなし", () => {
    expect(make().manager.getState()).toEqual({players: []});
  });

  describe("apply", () => {
    it("reset で全員を入れ替え、seat の昇順に並べる(位置は state に入れない)", () => {
      const {manager} = make();
      manager.apply({
        type: "reset",
        players: [
          {...status("b", {seat: 2}), transform: transform(1)},
          {...status("a", {seat: 1}), transform: transform(1)},
        ],
      });
      expect(manager.getState().players).toEqual([
        status("a", {seat: 1}),
        status("b", {seat: 2}),
      ]);
    });

    it("upsert で 1 人分を置き換え、居なければ足す", () => {
      const {manager} = make();
      manager.apply({type: "upsert", player: status("a")});
      manager.apply({
        type: "upsert",
        player: status("a", {connection: "disconnected"}),
      });
      manager.apply({type: "upsert", player: status("b", {seat: 2})});
      expect(manager.getState().players.map((p) => p.connection)).toEqual([
        "disconnected",
        "connected",
      ]);
    });

    it("状態が変わるたびに subscribe したリスナーを呼ぶ。transforms では呼ばない", () => {
      const {manager} = make();
      const listener = vi.fn();
      manager.subscribe(listener);
      manager.apply({type: "upsert", player: status("a")});
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1)}],
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("lifeChanged", () => {
    it("upsert で生死が変わったときだけ通知する", () => {
      const {manager} = make();
      const cb = vi.fn();
      manager.on("lifeChanged", cb);
      manager.apply({type: "upsert", player: status("a")});
      manager.apply({
        type: "upsert",
        player: status("a", {connection: "disconnected"}),
      });
      manager.apply({
        type: "upsert",
        player: status("a", {life: "eliminated"}),
      });
      expect(cb.mock.calls).toEqual([[{playerId: "a", life: "eliminated"}]]);
    });

    it("reset では通知しない(再接続で演出を繰り返さない)", () => {
      const {manager} = make();
      manager.apply({type: "upsert", player: status("a")});
      const cb = vi.fn();
      manager.on("lifeChanged", cb);
      manager.apply({
        type: "reset",
        players: [
          {...status("a", {life: "eliminated"}), transform: transform(1)},
        ],
      });
      expect(cb).not.toHaveBeenCalled();
    });

    it("コールバックの例外は他のコールバックに影響しない", () => {
      const {manager} = make();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const after = vi.fn();
      manager.on("lifeChanged", () => {
        throw new Error("boom");
      });
      manager.on("lifeChanged", after);
      manager.apply({type: "upsert", player: status("a")});
      manager.apply({
        type: "upsert",
        player: status("a", {life: "eliminated"}),
      });
      expect(after).toHaveBeenCalledTimes(1);
    });
  });

  describe("sample", () => {
    const out = () => createPlayerState(0, 0, 0);

    it("位置が無ければ false", () => {
      expect(make().manager.sample("a", 0, out())).toBe(false);
    });

    it("遅らせた時刻で、前後の位置を補間する", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1, 0)}],
      });
      at(1050);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(2, 1)}],
      });
      const s = out();
      expect(manager.sample("a", 1025 + INTERPOLATION_DELAY_MS, s)).toBe(true);
      expect(s.position.x).toBeCloseTo(0.5);
      expect(s.velocity.x).toBeCloseTo(20);
      expect(s.onGround).toBe(true);
    });

    it("最初より前は最初の位置、最後より後は最後の位置で止める(速さ 0)", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1, 0)}],
      });
      at(1050);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(2, 1)}],
      });
      const s = out();
      manager.sample("a", 900, s);
      expect(s.position.x).toBe(0);
      manager.sample("a", 5000, s);
      expect(s.position.x).toBe(1);
      expect(s.velocity.x).toBe(0);
    });

    it("yaw は近い回り方で補間する", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [
          {playerId: "a", transform: transform(1, 0, {yaw: Math.PI - 0.1})},
        ],
      });
      at(1100);
      manager.apply({
        type: "transforms",
        players: [
          {playerId: "a", transform: transform(2, 0, {yaw: -Math.PI + 0.1})},
        ],
      });
      const s = out();
      manager.sample("a", 1050 + INTERPOLATION_DELAY_MS, s);
      expect(Math.cos(s.yaw)).toBeCloseTo(-1);
    });

    it("上下に動いている間は接地していない", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1)}],
      });
      at(1050);
      manager.apply({
        type: "transforms",
        players: [
          {playerId: "a", transform: transform(2, 0, {position: [0, 0.2, 0]})},
        ],
      });
      const s = out();
      manager.sample("a", 1025 + INTERPOLATION_DELAY_MS, s);
      expect(s.onGround).toBe(false);
    });

    it("seq が増えていない位置は捨てる", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(5, 0)}],
      });
      at(1050);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(5, 9)}],
      });
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(4, 9)}],
      });
      const s = out();
      manager.sample("a", 5000, s);
      expect(s.position.x).toBe(0);
    });

    it("reset で位置を入れ直す(古い seq の位置は残らない)", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(50, 9)}],
      });
      manager.apply({
        type: "reset",
        players: [{...status("a"), transform: transform(3, 1)}],
      });
      const s = out();
      manager.sample("a", 5000, s);
      expect(s.position.x).toBe(1);
    });

    it("止まっていた後の動き出しも、遅延の分だけ遅らせて補間する(一気に進まない)", () => {
      const {manager, at} = make();
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1, 0)}],
      });
      at(6000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(2, 0.2)}],
      });
      at(6050);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(3, 0.4)}],
      });
      const s = out();
      manager.sample("a", 6000, s);
      expect(s.position.x).toBe(0);
      manager.sample("a", 6075, s);
      expect(s.position.x).toBeCloseTo(0.1);
      expect(s.velocity.x).toBeCloseTo(4);
    });

    it("ジャンプの頂点をまたぐ区間で、接地に戻らない", () => {
      const {manager, at} = make();
      const ys = [0, 0, 0.5, 0.8, 0.8, 0.5, 0];
      ys.forEach((y, i) => {
        at(1000 + i * 50);
        manager.apply({
          type: "transforms",
          players: [
            {
              playerId: "a",
              transform: transform(i + 1, 0, {position: [0, y, 0]}),
            },
          ],
        });
      });
      const s = out();
      const groundAt = (ms: number) => {
        manager.sample("a", ms + INTERPOLATION_DELAY_MS, s);
        return s.onGround;
      };
      expect(groundAt(1025)).toBe(true);
      expect(groundAt(1075)).toBe(false);
      expect(groundAt(1175)).toBe(false);
      expect(groundAt(1275)).toBe(false);
    });
  });

  describe("補間を切ったとき", () => {
    it("最後に届いた位置をそのまま書き、速さは最後の区間、届かなくなったら止まる", () => {
      const {manager, at} = make();
      manager.setInterpolation(false);
      at(1000);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(1, 0)}],
      });
      at(1050);
      manager.apply({
        type: "transforms",
        players: [{playerId: "a", transform: transform(2, 1)}],
      });
      const s = createPlayerState(0, 0, 0);
      manager.sample("a", 1060, s);
      expect(s.position.x).toBe(1);
      expect(s.velocity.x).toBeCloseTo(20);
      manager.sample("a", 1300, s);
      expect(s.position.x).toBe(1);
      expect(s.velocity.x).toBe(0);
      expect(s.onGround).toBe(true);
    });
  });

  describe("自分", () => {
    it("自分の位置は届いても持たず(補間もしない)、他のプレイヤーは持つ", () => {
      const {manager} = make("me");
      manager.apply({
        type: "reset",
        players: [
          {...status("me"), transform: transform(128)},
          {...status("b", {seat: 2}), transform: transform(3)},
        ],
      });
      manager.apply({
        type: "transforms",
        players: [{playerId: "me", transform: transform(129)}],
      });
      expect(manager.sample("me", 5000, createPlayerState(0, 0, 0))).toBe(
        false,
      );
      expect(manager.sample("b", 5000, createPlayerState(0, 0, 0))).toBe(true);
      expect(manager.getState().players.map((p) => p.playerId)).toEqual([
        "me",
        "b",
      ]);
    });

    it("自分の ID が無い間は、全員を他のプレイヤーとして持つ", () => {
      const {manager} = make(null);
      manager.apply({
        type: "reset",
        players: [{...status("me"), transform: transform(1)}],
      });
      expect(manager.sample("me", 5000, createPlayerState(0, 0, 0))).toBe(true);
    });

    it("自分の ID が変わったら、前の自分も他のプレイヤーと同じく、次の位置から補間する", () => {
      const {manager, setMe} = make("x");
      manager.apply({
        type: "reset",
        players: [{...status("x"), transform: transform(1)}],
      });
      setMe("y");
      expect(manager.sample("x", 5000, createPlayerState(0, 0, 0))).toBe(false);
      manager.apply({
        type: "transforms",
        players: [{playerId: "x", transform: transform(2, 3)}],
      });
      const s = createPlayerState(0, 0, 0);
      expect(manager.sample("x", 5000, s)).toBe(true);
      expect(s.position.x).toBe(3);
    });
  });
});
