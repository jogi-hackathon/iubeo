import type {Vec3} from "../props/types";
import type {GameObject} from "./types";

export type LayoutItem = {
  id: string;
  position: Vec3;
  yaw?: number;
  look?: string;
};

export type DirectoryLook = "small" | "large";

export type DirectoryLayoutItem = {
  id: string;
  position: Vec3;
  look?: DirectoryLook;
};

export const directoryItem = (item: DirectoryLayoutItem): LayoutItem => item;

export type SceneLayout = Readonly<Record<string, LayoutItem>>;

export const kindOfId = (id: string): string => id.replace(/-\d+$/, "");

export const featureKey = (name: string, feature: string): string =>
  `${name}:${feature}`;

export type LayoutAssignment = {
  object: GameObject;
  name: string;
  item: LayoutItem;
};

export type LayoutMatch = {
  assigned: LayoutAssignment[];
  unmatched: GameObject[];
};

export const matchLayout = (
  layout: SceneLayout,
  objects: readonly GameObject[],
): LayoutMatch => {
  const byId = new Map<string, {name: string; item: LayoutItem}>();
  for (const [name, item] of Object.entries(layout)) {
    if (!byId.has(item.id)) {
      byId.set(item.id, {name, item});
    }
  }
  const assigned: LayoutAssignment[] = [];
  const unmatched: GameObject[] = [];
  for (const object of objects) {
    const hit = byId.get(object.id);
    if (hit) {
      assigned.push({object, name: hit.name, item: hit.item});
    } else {
      unmatched.push(object);
    }
  }
  return {assigned, unmatched};
};
