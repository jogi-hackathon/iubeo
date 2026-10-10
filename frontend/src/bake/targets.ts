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

/** 追加・削除を購読する。1回のマウントで複数登録されると登録ごとに呼ばれるので、重い処理は呼び出し側でまとめること */
export const subscribeBakeTargets = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
