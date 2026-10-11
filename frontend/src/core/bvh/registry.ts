import type {Mesh} from "three";

export interface Collider {
  mesh: Mesh;
  enabled: boolean;
}

const colliders = new Set<Collider>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) {
    l();
  }
};

export const addCollider = (c: Collider): void => {
  colliders.add(c);
  notify();
};

export const removeCollider = (c: Collider): void => {
  if (colliders.delete(c)) {
    notify();
  }
};

export const setColliderEnabled = (c: Collider, enabled: boolean): void => {
  c.enabled = enabled;
};

export const listColliders = (): readonly Collider[] => [...colliders];

export const subscribeColliders = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
