import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Object3D} from "three";

import {useSfxEmitter} from "../core/audio/sfx/useSfxEmitter";
import {MAX_DELTA} from "../core/time";
import {createFootfall} from "./footfall";
import type {PlayerState} from "./types";

const SPATIAL = {ref: 1.5, rolloff: 1.5};
const RECIPES = ["step", "jump", "land"] as const;

export const useFootsteps = (state: PlayerState, enabled: boolean): void => {
  const anchor = useMemo(() => new Object3D(), []);
  const target = useRef<Object3D>(anchor);
  const sfx = useSfxEmitter(RECIPES, target, SPATIAL);
  const footfall = useMemo(() => createFootfall(), []);

  useEffect(() => {
    if (enabled) {
      footfall.reset(state);
    }
  }, [enabled, footfall, state]);

  useFrame((_, delta) => {
    if (!enabled) {
      return;
    }
    sfx.setPosition(state.position);
    for (const event of footfall.update(state, Math.min(delta, MAX_DELTA))) {
      if (event.kind === "land") {
        sfx.play("land", event.amount);
      } else {
        sfx.play(event.kind);
      }
    }
  });
};
