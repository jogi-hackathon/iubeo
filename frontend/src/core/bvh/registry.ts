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

export const addCollider = (c: Collider): void => {
  colliders.add(c);
};

export const removeCollider = (c: Collider): void => {
  colliders.delete(c);
};

/** enabled なものだけ返さず全件返す。判定側で enabled を見ること */
export const listColliders = (): readonly Collider[] => [...colliders];
