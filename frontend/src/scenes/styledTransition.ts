import type {SceneName} from ".";
import type {
  SceneTransitionContext,
  SceneTransitionManager,
  SceneTransitionManagerOptions,
} from "./sceneTransitionManager";

export type TransitionStyle = {
  run(ctx: SceneTransitionContext): Promise<void>;
  waitReady(scene: SceneName): Promise<void>;
  finish(ctx: SceneTransitionContext): void | Promise<void>;
};

export type DiveTransitionStyle = TransitionStyle & {
  canRun(ctx: SceneTransitionContext): boolean;
};

type Deps = {
  coverStyle: TransitionStyle;
  lockControl: () => () => void;
  onTransitionStart: () => void;
  setActive: (active: boolean) => void;
};

export const createStyledTransition = ({
  coverStyle,
  lockControl,
  onTransitionStart,
  setActive,
}: Deps) => {
  let diveStyle: DiveTransitionStyle | null = null;
  let currentStyle: TransitionStyle = coverStyle;
  let releaseTransitionLock: (() => void) | null = null;

  const releaseLock = () => {
    releaseTransitionLock?.();
    releaseTransitionLock = null;
  };

  const pickStyle = (ctx: SceneTransitionContext): TransitionStyle => {
    if (diveStyle) {
      try {
        if (diveStyle.canRun(ctx)) {
          return diveStyle;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return coverStyle;
  };

  const hooks: Pick<
    SceneTransitionManagerOptions,
    "runTransition" | "waitReady" | "finishTransition"
  > = {
    runTransition: async (ctx) => {
      currentStyle = pickStyle(ctx);
      try {
        await currentStyle.run(ctx);
      } catch (e) {
        releaseLock();
        throw e;
      }
    },
    waitReady: (scene) => currentStyle.waitReady(scene),
    finishTransition: async (ctx) => {
      try {
        await currentStyle.finish(ctx);
      } finally {
        releaseLock();
      }
    },
  };

  return {
    hooks,
    setDiveStyle: (style: DiveTransitionStyle | null): void => {
      diveStyle = style;
    },
    bind: (manager: SceneTransitionManager): void => {
      manager.on("transitionStart", () => {
        releaseLock();
        releaseTransitionLock = lockControl();
        onTransitionStart();
        setActive(true);
      });
      manager.subscribe(() => {
        if (manager.getState().status === "idle") {
          setActive(false);
        }
      });
    },
  };
};
