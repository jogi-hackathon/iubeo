import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef, useSyncExternalStore} from "react";

import {setOutlineSelection} from "../camera/postprocess/outlineSelection";
import {addPowerOutline} from "../camera/postprocess/powerOutlineSelection";
import {
  armPipelineWatch,
  disarmPipelineWatch,
  installPipelineWatch,
} from "./debug/pipelineWatch";
import {FRAME_PRIORITY} from "./frameOrder";
import {getShaderSwatchBook} from "./shaderSwatches";
import {exposeForWarmup, firstMeshOf} from "./warmupExposure";
import {createWarmupTracker, sceneSignature} from "./warmupTracker";

let finishing = false;
let done = false;
let holds = 0;
let restartRequested = false;
let waiters: Array<() => void> = [];
const listeners = new Set<() => void>();

const finish = () => {
  done = true;
  if (import.meta.env.DEV) {
    armPipelineWatch();
  }
  for (const l of Array.from(listeners)) {
    l();
  }
  const resolved = waiters;
  waiters = [];
  for (const resolve of resolved) {
    resolve();
  }
};

export const warmupShaders = (): Promise<void> =>
  new Promise((resolve) => {
    waiters.push(resolve);
    if (finishing && done) {
      finishing = false;
      restartRequested = true;
      disarmPipelineWatch();
    }
  });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useShaderWarmupDone = (): boolean =>
  useSyncExternalStore(subscribe, () => done);

export const holdShaderWarmup = (): (() => void) => {
  holds++;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holds--;
  };
};

type DeviceLike = {queue: {onSubmittedWorkDone(): Promise<void>}};

export function ShaderWarmup() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const state = useRef<{
    tracker: ReturnType<typeof createWarmupTracker> | null;
    frame: number;
    restoreExposure: (() => void) | null;
    offPower: (() => void) | null;
  }>({tracker: null, frame: 0, restoreExposure: null, offPower: null});

  const restore = () => {
    const s = state.current;
    s.restoreExposure?.();
    s.restoreExposure = null;
    s.offPower?.();
    s.offPower = null;
    if (s.frame > 0) {
      s.frame = 0;
      setOutlineSelection([]);
    }
    const book = getShaderSwatchBook();
    book.parent?.remove(book);
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      installPipelineWatch(gl as unknown as {backend: object});
    }
  }, [gl]);

  useEffect(() => restore, []);

  useFrame(() => {
    if (finishing) {
      return;
    }
    const s = state.current;
    const now = performance.now();
    if (restartRequested) {
      restartRequested = false;
      s.tracker = null;
    }
    s.tracker ??= createWarmupTracker(now);
    if (!s.tracker.update(sceneSignature(scene), now, holds > 0)) {
      const book = getShaderSwatchBook();
      if (book.parent !== scene) {
        scene.add(book);
      }
      s.restoreExposure = exposeForWarmup(scene);
      s.frame++;
      const target = s.frame % 2 === 0 ? scene : firstMeshOf(scene);
      setOutlineSelection(target ? [target] : []);
      s.offPower?.();
      s.offPower = target
        ? addPowerOutline(target, {ignoreDistance: true})
        : null;
      return;
    }
    finishing = true;
    restore();
    const {device} = (gl as unknown as {backend: {device: DeviceLike}}).backend;
    device.queue.onSubmittedWorkDone().then(finish, finish);
  }, FRAME_PRIORITY.warmup);

  // 描画(PostProcess)のあと、同じフレームの内に表示とカリングを戻す
  useFrame(() => {
    const s = state.current;
    s.restoreExposure?.();
    s.restoreExposure = null;
  }, FRAME_PRIORITY.warmupRestore);

  return null;
}
