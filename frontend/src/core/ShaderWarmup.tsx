import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef, useSyncExternalStore} from "react";
import type {Object3D} from "three";

import {setOutlineSelection} from "../camera/postprocess/outlineSelection";
import {addPowerOutline} from "../camera/postprocess/powerOutlineSelection";
import {FRAME_PRIORITY} from "./frameOrder";
import {createWarmupTracker, sceneSignature} from "./warmupTracker";

// 終了の状態はモジュールに置く。Fast Refresh でこのモジュールが再評価されたら、コンポーネント側も一緒にやり直す
let finishing = false;
let done = false;
let holds = 0;
let restartRequested = false;
let waiters: Array<() => void> = [];
const listeners = new Set<() => void>();

const finish = () => {
  done = true;
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
    culled: Set<Object3D>;
    frame: number;
    offPower: (() => void) | null;
  }>({tracker: null, culled: new Set(), frame: 0, offPower: null});

  const restore = () => {
    const s = state.current;
    for (const o of s.culled) {
      o.frustumCulled = true;
    }
    s.culled.clear();
    s.offPower?.();
    s.offPower = null;
    if (s.frame > 0) {
      s.frame = 0;
      setOutlineSelection([]);
    }
  };

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
      let firstMesh: Object3D | null = null;
      scene.traverse((o) => {
        if (firstMesh === null && (o as {isMesh?: boolean}).isMesh) {
          firstMesh = o;
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          s.culled.add(o);
        }
      });
      s.frame++;
      const target = s.frame % 2 === 0 ? scene : firstMesh;
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

  return null;
}
