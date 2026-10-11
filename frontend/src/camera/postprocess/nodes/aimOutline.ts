import {type Camera, Color, type Scene} from "three";
import {outline} from "three/addons/tsl/display/OutlineNode.js";
import {clamp, float, mix, uniform, vec4} from "three/tsl";
import type {Node} from "three/webgpu";

import {outlineSelection} from "../outlineSelection";

const OUTLINE_COLOR = "#1a1a1a";
const OUTLINE_THICKNESS = 1.5;
const OUTLINE_STRENGTH = 4;

export const createAimOutline = (scene: Scene, camera: Camera) => {
  const outlinePass = outline(scene, camera, {
    selectedObjects: outlineSelection,
    edgeThickness: uniform(OUTLINE_THICKNESS),
    edgeGlow: float(0),
  });
  const outlineColor = uniform(new Color(OUTLINE_COLOR));

  return {
    composite: (
      color: Node<"vec4">,
      weight: Node<"float"> = float(1),
    ): Node<"vec4"> =>
      vec4(
        mix(
          color.rgb,
          outlineColor,
          clamp(outlinePass.visibleEdge.mul(OUTLINE_STRENGTH), 0, 1).mul(
            weight,
          ),
        ),
        color.a,
      ),
    dispose: (): void => {
      outlinePass.dispose();
    },
  };
};

export type AimOutline = ReturnType<typeof createAimOutline>;
