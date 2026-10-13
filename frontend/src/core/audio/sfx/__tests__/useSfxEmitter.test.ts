import {beforeEach, describe, expect, it, vi} from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => (() => void) | undefined)[],
  frames: [] as (() => void)[],
}));

vi.mock("react", () => ({
  useRef: <T>(value: T) => ({current: value}),
  useMemo: <T>(make: () => T) => make(),
  useEffect: (effect: () => (() => void) | undefined) => {
    hooks.effects.push(effect);
  },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: () => void) => {
    hooks.frames.push(callback);
  },
}));

const fake = vi.hoisted(() => ({
  setPosition: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../engine", () => ({
  sfxEngine: {
    emitter: (...args: unknown[]) => {
      fake.create(...args);
      return fake;
    },
  },
}));

import {Object3D} from "three";

import {useSfxEmitter} from "../useSfxEmitter";

describe("useSfxEmitter", () => {
  beforeEach(() => {
    hooks.effects.length = 0;
    hooks.frames.length = 0;
    vi.clearAllMocks();
  });

  it("マウントで recipes を渡して 1 回だけ作り、位置を入れ、unmount で dispose する", () => {
    const object = new Object3D();
    object.position.set(1, 2, 3);
    const emitter = useSfxEmitter(["pcFan"], {current: object});
    const cleanup = hooks.effects[0]!();
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fake.create).toHaveBeenCalledWith(["pcFan"], undefined, undefined);
    expect(fake.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({x: 1, y: 2, z: 3}),
    );

    emitter.play("pcFan");
    expect(fake.play).toHaveBeenCalledWith("pcFan");

    expect(fake.dispose).not.toHaveBeenCalled();
    (cleanup as () => void)();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it("最初のフレームで位置をもう一度入れ、以後は入れない", () => {
    useSfxEmitter(["shatter"], {current: new Object3D()});
    hooks.effects[0]!();
    fake.setPosition.mockClear();
    hooks.frames[0]!();
    hooks.frames[0]!();
    expect(fake.setPosition).toHaveBeenCalledTimes(1);
  });
});
