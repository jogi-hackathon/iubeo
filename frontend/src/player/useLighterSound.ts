import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Object3D} from "three";

import {useSfxEmitter} from "../core/audio/sfx/useSfxEmitter";
import {LIGHTER_IGNITE_DELAY_MS} from "../items/lighter";
import type {PlayerState} from "./types";

const HAND_UP = 1.1;
const HAND_FORWARD = 0.4;
const RECIPES = ["ignite", "flame"] as const;

const placeAtHand = (state: PlayerState, out: Object3D): void => {
  const {position, yaw} = state;
  out.position.set(
    position.x - Math.sin(yaw) * HAND_FORWARD,
    position.y + HAND_UP,
    position.z - Math.cos(yaw) * HAND_FORWARD,
  );
};

export const useLighterSound = (
  state: PlayerState,
  present: boolean,
  holding: boolean,
): void => {
  const lit = present && holding;
  const previous = useRef({present: false, holding: false});
  const anchor = useMemo(() => new Object3D(), []);
  const target = useRef<Object3D>(anchor);
  const sfx = useSfxEmitter(RECIPES, target);

  useEffect(() => {
    const was = previous.current;
    previous.current = {present, holding};
    if (!lit) {
      return;
    }
    placeAtHand(state, anchor);
    sfx.setPosition(anchor.position);
    const lighting = was.present && !was.holding;
    if (lighting) {
      sfx.play("ignite");
    }
    const id = setTimeout(
      () => sfx.play("flame"),
      lighting ? LIGHTER_IGNITE_DELAY_MS : 0,
    );
    return () => {
      clearTimeout(id);
      sfx.stop("ignite");
      sfx.stop("flame");
    };
  }, [present, holding, lit, sfx, state, anchor]);

  useFrame(() => {
    if (!lit) {
      return;
    }
    placeAtHand(state, anchor);
    sfx.setPosition(anchor.position);
  });
};
