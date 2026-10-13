import {beforeEach, describe, expect, it, vi} from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => (() => void) | undefined)[],
  frames: [] as (() => void)[],
  camera: null as unknown,
}));

vi.mock("react", () => ({
  useEffect: (effect: () => (() => void) | undefined) => {
    hooks.effects.push(effect);
  },
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: {camera: unknown}) => unknown) =>
    select({camera: hooks.camera}),
  useFrame: (callback: () => void) => {
    hooks.frames.push(callback);
  },
}));

const manager = vi.hoisted(() => ({
  setListener: vi.fn(),
  unlock: vi.fn(),
}));
vi.mock("../audioManager", () => ({audioManager: manager}));

import {PerspectiveCamera} from "three";

import {AudioListenerSync} from "../AudioListenerSync";

describe("AudioListenerSync", () => {
  beforeEach(() => {
    hooks.effects.length = 0;
    hooks.frames.length = 0;
    vi.clearAllMocks();
  });

  it("毎フレーム、カメラの位置・前・上を audioManager.setListener に渡す", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.updateMatrixWorld(true);
    hooks.camera = camera;
    AudioListenerSync();
    hooks.frames[0]!();
    const [position, forward, up] = manager.setListener.mock.calls[0]!;
    expect(position).toEqual({x: 1, y: 2, z: 3});
    expect(forward.z).toBeCloseTo(-1);
    expect(up.y).toBeCloseTo(1);
  });

  it("pointerdown で unlock を呼び、片付けで外す", () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: () => void) =>
        listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    hooks.camera = new PerspectiveCamera();
    AudioListenerSync();
    const cleanup = hooks.effects[0]!();
    listeners.get("pointerdown")!();
    expect(manager.unlock).toHaveBeenCalledTimes(1);
    cleanup!();
    expect(listeners.has("pointerdown")).toBe(false);
    vi.unstubAllGlobals();
  });
});
