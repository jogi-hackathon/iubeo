import type {Object3D} from "three";

const selection: Object3D[] = [];

export const outlineSelection: Object3D[] = selection;

export const setOutlineSelection = (objects: readonly Object3D[]): void => {
  selection.length = 0;
  selection.push(...objects);
};
