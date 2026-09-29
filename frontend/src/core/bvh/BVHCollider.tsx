import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import type { Group, Mesh } from "three";
import { addCollider, type Collider, removeCollider } from "./registry";
import "./setup";

interface BVHColliderProps {
  enabled?: boolean;
  children?: ReactNode;
}

/** 子孫の mesh をマウント時に BVH 化してコライダー登録する。マウント後に追加された mesh は対象外 */
export function BVHCollider({ enabled = true, children }: BVHColliderProps) {
  const group = useRef<Group>(null);
  const colliders = useRef<Collider[]>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const added: Collider[] = [];
    const built: Mesh["geometry"][] = [];
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundsTree) {
        mesh.geometry.computeBoundsTree();
        built.push(mesh.geometry);
      }
      const c: Collider = { mesh, enabled: enabledRef.current };
      addCollider(c);
      added.push(c);
    });
    colliders.current = added;
    return () => {
      for (const c of added) removeCollider(c);
      for (const g of built) g.disposeBoundsTree();
      colliders.current = [];
    };
  }, []);

  useEffect(() => {
    for (const c of colliders.current) c.enabled = enabled;
  }, [enabled]);

  return <group ref={group}>{children}</group>;
}
