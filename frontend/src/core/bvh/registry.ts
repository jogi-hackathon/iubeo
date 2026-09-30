import type { Mesh } from "three";

/**
 * 衝突判定の対象。mesh.geometry.boundsTree(MeshBVH)が構築済みであること。
 * 将来の静的マージ(StaticBVHGroup)も、マージ済み mesh を 1 コライダーとして登録すれば同じ形で扱える。
 */
export interface Collider {
  mesh: Mesh;
  enabled: boolean;
}

const colliders = new Set<Collider>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

export const addCollider = (c: Collider): void => {
  colliders.add(c);
  notify();
};

export const removeCollider = (c: Collider): void => {
  if (colliders.delete(c)) notify();
};

/** enabled なものだけ返さず全件返す。判定側で enabled を見ること */
export const listColliders = (): readonly Collider[] => [...colliders];

/**
 * コライダーの追加・削除を購読する(非同期に読み込む prop が後から登録される場合など)。
 * 1回のマウントで複数登録されると登録ごとに呼ばれるので、重い処理は呼び出し側でまとめること
 */
export const subscribeColliders = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
