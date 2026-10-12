import {useSyncExternalStore} from "react";
import type {Mesh} from "three/webgpu";

import {createPortalMaterial} from "../../transition/dive/portalMaterial";

const screens = new Map<string, Mesh>();
const listeners = new Set<() => void>();
let portalId: string | null = null;
let material: ReturnType<typeof createPortalMaterial> | null = null;

export const registerPcScreen = (id: string, mesh: Mesh): (() => void) => {
  screens.set(id, mesh);
  return () => {
    if (screens.get(id) === mesh) {
      screens.delete(id);
    }
  };
};

export const getPcScreen = (id: string): Mesh | undefined => screens.get(id);

export const getPortalMaterial = () => (material ??= createPortalMaterial());

export const setPortalScreen = (id: string | null): void => {
  if (portalId === id) {
    return;
  }
  portalId = id;
  for (const l of Array.from(listeners)) {
    l();
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const usePortalScreenId = (): string | null =>
  useSyncExternalStore(subscribe, () => portalId);
