import {Color, type Object3D, Vector3} from "three";
import {uniform} from "three/tsl";

export const POWER_OUTLINE_FADE_START = 3;
export const POWER_OUTLINE_FADE_END = 4;

export const powerOutlineFadeAt = (distance: number): number => {
  const t = Math.min(
    1,
    Math.max(
      0,
      (distance - POWER_OUTLINE_FADE_START) /
        (POWER_OUTLINE_FADE_END - POWER_OUTLINE_FADE_START),
    ),
  );
  return 1 - t * t * (3 - 2 * t);
};

export const POWER_OUTLINE_DEFAULT_COLOR = "#ff1f2e";

export const GUIDE_OUTLINE = {color: "#000000", dashed: true} as const;

type Entry = {
  object: Object3D;
  ignoreDistance: boolean;
  color: string;
  dashed: boolean;
};
const registered: Entry[] = [];
const selection: Object3D[] = [];

export const powerOutlineSelection: Object3D[] = selection;
export const powerOutlineFade = uniform(0);
export const powerOutlineColor = uniform(
  new Color(POWER_OUTLINE_DEFAULT_COLOR),
);
export const powerOutlineDash = uniform(0);

export const addPowerOutline = (
  object: Object3D,
  {
    ignoreDistance = false,
    color = POWER_OUTLINE_DEFAULT_COLOR,
    dashed = false,
  }: {ignoreDistance?: boolean; color?: string; dashed?: boolean} = {},
): (() => void) => {
  const entry: Entry = {object, ignoreDistance, color, dashed};
  registered.push(entry);
  return () => {
    const i = registered.indexOf(entry);
    if (i >= 0) {
      registered.splice(i, 1);
    }
  };
};

const worldPosition = new Vector3();

export const updatePowerOutline = (cameraPosition: Vector3): void => {
  selection.length = 0;
  let fade = 0;
  let head: Entry | null = null;
  for (const entry of registered) {
    const {object, ignoreDistance} = entry;
    const f = ignoreDistance
      ? 1
      : powerOutlineFadeAt(
          object.getWorldPosition(worldPosition).distanceTo(cameraPosition),
        );
    if (f > 0) {
      selection.push(object);
      fade = Math.max(fade, f);
      head ??= entry;
    }
  }
  powerOutlineFade.value = fade;
  powerOutlineColor.value.set(head?.color ?? POWER_OUTLINE_DEFAULT_COLOR);
  powerOutlineDash.value = head?.dashed ? 1 : 0;
};
