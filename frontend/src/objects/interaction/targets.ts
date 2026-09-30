import type {Object3D} from "three";

/** 狙いの判定の対象になるオブジェクトの根(ManagedObjects が描画した group)。userData にこのキーで id を持つ */
export const OBJECT_ID_KEY = "objectId";

const roots = new Map<string, Object3D>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

/** 根の登録・解除を購読する(狙いの候補のキャッシュを組み直す合図)。戻り値は解除関数 */
export const subscribeTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 根を登録する。戻り値は解除関数(登録が入れ替わっていたら何もしない) */
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

/** 当たった物から祖先へたどって、属しているオブジェクトの id を返す(無ければ null) */
export const ownerObjectId = (object: Object3D): string | null => {
  for (let o: Object3D | null = object; o; o = o.parent) {
    const id = o.userData[OBJECT_ID_KEY];
    if (typeof id === "string") {
      return id;
    }
  }
  return null;
};
