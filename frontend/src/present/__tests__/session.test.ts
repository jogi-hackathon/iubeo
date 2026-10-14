import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  setMixMuted: vi.fn(),
  unlock: vi.fn(),
  solo: vi.fn(),
}));

vi.mock("../../core/audio/audioManager", () => ({
  audioManager: {setMixMuted: mocks.setMixMuted, unlock: mocks.unlock},
}));
vi.mock("../../core/audio/sfx/engine", () => ({
  sfxEngine: {solo: mocks.solo},
}));
vi.mock("../../core/debug/devPanel", () => ({closeDevPanel: vi.fn()}));
vi.mock("../../core/input/pointerLock", () => ({
  resumePointerLock: vi.fn(),
  suppressPointerLock: vi.fn(() => vi.fn()),
}));
vi.mock("../../core/playerControl", () => ({
  lockPlayerControl: vi.fn(() => vi.fn()),
}));
vi.mock("../../objects/directory/overview", () => ({
  overview: {reset: vi.fn()},
}));
vi.mock("../../player/local", () => ({localPlayer: {}}));
vi.mock("../../scenes", () => ({spawnOf: vi.fn()}));
vi.mock("../../scenes/RoomScene/credits/store", () => ({
  credits: {reset: vi.fn()},
}));
vi.mock("../../scenes/RoomScene/tutorial/manager", () => ({
  tutorialManager: {reset: vi.fn()},
}));
vi.mock("../../scenes/sceneStore", () => ({
  sceneManager: {getState: () => ({current: "room"})},
  sceneTransitionManager: {goTo: vi.fn()},
}));
vi.mock("../../scenes/spawn", () => ({applySpawn: vi.fn()}));

import {GLITCH_MS} from "../chat";
import {riseStore} from "../riseStore";
import {stepIndexOf} from "../script";
import {
  advancePresentation,
  backPresentation,
  endPresentation,
  startPresentation,
} from "../session";
import {presentStore} from "../store";

const SWAP = stepIndexOf("intro", "swap");
const LOGO = stepIndexOf("intro", "logo");

describe("session の効果音", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {pointerLockElement: null});
    endPresentation();
    vi.clearAllMocks();
  });

  it("始めるときゲームとボイスの音を止め、Esc で戻す", () => {
    startPresentation("intro");
    expect(mocks.setMixMuted).toHaveBeenLastCalledWith(true);
    endPresentation();
    expect(mocks.setMixMuted).toHaveBeenLastCalledWith(false);
  });

  it("手順 swap に入ったときだけグリッチ音を鳴らす", () => {
    startPresentation("intro", SWAP - 1);
    expect(mocks.solo).not.toHaveBeenCalled();
    advancePresentation();
    expect(mocks.solo).toHaveBeenCalledWith("glitch", GLITCH_MS);
    expect(mocks.unlock).toHaveBeenCalled();
    advancePresentation();
    expect(mocks.solo).toHaveBeenCalledTimes(1);
  });

  it("手順を戻って swap に入ったときも鳴らし、dev パネルから swap で始めても鳴らす", () => {
    startPresentation("intro", SWAP + 1);
    backPresentation();
    expect(presentStore.getState()).toMatchObject({step: SWAP});
    expect(mocks.solo).toHaveBeenCalledTimes(1);
    endPresentation();
    startPresentation("intro", SWAP);
    expect(mocks.solo).toHaveBeenCalledTimes(2);
  });

  it("ロゴの次へで転換し、音を戻して、プレゼンの層を消して起き上がりに入る", () => {
    startPresentation("intro", LOGO);
    expect(riseStore.getState()).toBeNull();
    advancePresentation();
    expect(presentStore.getState().active).toBe(false);
    expect(mocks.setMixMuted).toHaveBeenLastCalledWith(false);
    expect(riseStore.getState()).not.toBeNull();
    riseStore.finish();
    expect(riseStore.getState()).toBeNull();
  });

  it("転換の手順から始めても同じく転換する", () => {
    startPresentation("intro", LOGO + 1);
    expect(presentStore.getState().active).toBe(false);
    expect(riseStore.getState()).not.toBeNull();
    riseStore.finish();
  });

  it("ロゴの最中の Esc では起き上がりに入らない", () => {
    startPresentation("intro", LOGO);
    endPresentation();
    expect(riseStore.getState()).toBeNull();
  });
});
