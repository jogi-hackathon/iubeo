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

import {isPlayerControlLocked} from "../../core/playerControl";
import {riseStore} from "../riseStore";
import {stepIndexOf} from "../script";
import {
  advancePresentation,
  endPresentation,
  startPresentation,
} from "../session";
import {presentStore} from "../store";

const LOGO_OUT = stepIndexOf("intro", "logo-out");

describe("session の操作ロック", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {pointerLockElement: null});
    endPresentation();
    riseStore.finish();
  });

  it("転換のあとも起き上がりが終わるまでロックが続き、finish で外れる", () => {
    startPresentation("intro", LOGO_OUT);
    expect(isPlayerControlLocked()).toBe(true);
    advancePresentation();
    expect(presentStore.getState().active).toBe(false);
    expect(isPlayerControlLocked()).toBe(true);
    riseStore.finish();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("起き上がり中に始め直しても解除漏れがない", () => {
    startPresentation("intro", LOGO_OUT);
    advancePresentation();
    startPresentation("intro", LOGO_OUT);
    expect(isPlayerControlLocked()).toBe(true);
    endPresentation();
    expect(isPlayerControlLocked()).toBe(false);
  });
});
