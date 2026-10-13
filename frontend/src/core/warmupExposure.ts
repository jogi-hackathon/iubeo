import type {Object3D} from "three";

export const exposeForWarmup = (root: Object3D): (() => void) => {
  const hidden: Object3D[] = [];
  const culled: Object3D[] = [];
  root.traverse((o) => {
    if (!o.visible) {
      o.visible = true;
      hidden.push(o);
    }
    if (o.frustumCulled) {
      o.frustumCulled = false;
      culled.push(o);
    }
  });
  return () => {
    for (const o of hidden) {
      o.visible = false;
    }
    for (const o of culled) {
      o.frustumCulled = true;
    }
  };
};

export const firstMeshOf = (root: Object3D): Object3D | null => {
  let found: Object3D | null = null;
  root.traverse((o) => {
    if (found === null && (o as {isMesh?: boolean}).isMesh) {
      found = o;
    }
  });
  return found;
};
