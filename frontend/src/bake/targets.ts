import type {Mesh} from "three";

const targets = new Set<Mesh>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) {
    l();
  }
};

export const addBakeTarget = (mesh: Mesh): void => {
  targets.add(mesh);
  notify();
};

export const removeBakeTarget = (mesh: Mesh): void => {
  if (targets.delete(mesh)) {
    notify();
  }
};

export const listBakeTargets = (): readonly Mesh[] => [...targets];

export const subscribeBakeTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
