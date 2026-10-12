import {useFrame} from "@react-three/fiber";
import {type RefObject, useEffect, useMemo, useRef} from "react";
import {type Object3D, Vector3} from "three";

import {sfxEngine} from "./engine";
import type {Emitter, OptionArgs, SfxId} from "./types";

const world = new Vector3();

const placeAtTarget = (emitter: Emitter, target: Object3D) => {
  target.updateWorldMatrix(true, false);
  target.getWorldPosition(world);
  emitter.setPosition(world);
};

export const useSfxEmitter = (
  recipes: readonly SfxId[],
  target: RefObject<Object3D | null>,
): Emitter => {
  const current = useRef<Emitter | null>(null);
  const placed = useRef(false);
  const initial = useRef(recipes);

  useEffect(() => {
    const emitter = sfxEngine.emitter(initial.current);
    current.current = emitter;
    placed.current = false;
    if (target.current) {
      placeAtTarget(emitter, target.current);
    }
    return () => {
      current.current = null;
      emitter.dispose();
    };
  }, [target]);

  useFrame(() => {
    const emitter = current.current;
    if (!emitter || placed.current || !target.current) {
      return;
    }
    placed.current = true;
    placeAtTarget(emitter, target.current);
  });

  return useMemo<Emitter>(
    () => ({
      setPosition: (pos) => current.current?.setPosition(pos),
      play: <Id extends SfxId>(id: Id, ...options: OptionArgs<Id>) =>
        current.current?.play(id, ...options),
      stop: (id) => current.current?.stop(id),
      dispose: () => {},
    }),
    [],
  );
};
