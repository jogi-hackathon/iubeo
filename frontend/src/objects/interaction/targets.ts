import type {Object3D} from "three";

export const OBJECT_ID_KEY = "objectId";

const roots = new Map<string, Object3D>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const subscribeTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const registerTarget = (id: string, root: Object3D): (() => void) => {
  roots.set(id, root);
  notify();
  return () => {
    if (roots.get(id) === root) {
      roots.delete(id);
      notify();
    }
  };
};

export const getTarget = (id: string): Object3D | undefined => roots.get(id);

export const listTargets = (): Object3D[] => Array.from(roots.values());

export const ownerObjectId = (object: Object3D): string | null => {
  for (let o: Object3D | null = object; o; o = o.parent) {
    const id = o.userData[OBJECT_ID_KEY];
    if (typeof id === "string") {
      return id;
    }
  }
  return null;
};
