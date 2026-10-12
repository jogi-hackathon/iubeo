import {Fn, screenSize, screenUV, time, uniform, vec4} from "three/tsl";
import type {Node} from "three/webgpu";

import {cellHash} from "../../../core/cellHash";

const STEPS_PER_SECOND = 24;

export const createGrain = () => {
  const amount = uniform(0);
  const noise = Fn(() =>
    cellHash(
      screenUV.mul(screenSize).floor(),
      time.mul(STEPS_PER_SECOND).floor(),
      11,
    ).sub(0.5),
  )();

  return {
    composite: (color: Node<"vec4">): Node<"vec4"> =>
      vec4(color.rgb.add(noise.mul(amount)), color.a),
    apply: (value: number): void => {
      amount.value = value;
    },
  };
};

export type Grain = ReturnType<typeof createGrain>;
