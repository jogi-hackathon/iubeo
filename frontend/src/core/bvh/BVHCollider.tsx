import {type ReactNode, useEffect, useLayoutEffect, useRef} from "react";
import type {Group, Mesh} from "three";

import {
  addCollider,
  type Collider,
  removeCollider,
  setColliderEnabled,
} from "./registry";
import "./setup";

interface BVHColliderProps {
  enabled?: boolean;
  blocksCamera?: boolean;
  children?: ReactNode;
}

export function BVHCollider({
  enabled = true,
  blocksCamera = false,
  children,
}: BVHColliderProps) {
  const group = useRef<Group>(null);
  const colliders = useRef<Collider[]>([]);
  const enabledRef = useRef(enabled);
  const blocksCameraRef = useRef(blocksCamera);

  useLayoutEffect(() => {
    const root = group.current;
    if (!root) {
      return;
    }
    const added: Collider[] = [];
    const built: Array<Mesh["geometry"]> = [];
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh || !mesh.geometry) {
        return;
      }
      if (!mesh.geometry.boundsTree) {
        mesh.geometry.computeBoundsTree();
        built.push(mesh.geometry);
      }
      const c: Collider = {
        mesh,
        enabled: enabledRef.current,
        blocksCamera: blocksCameraRef.current,
      };
      addCollider(c);
      added.push(c);
    });
    colliders.current = added;
    return () => {
      for (const c of added) {
        removeCollider(c);
      }
      for (const g of built) {
        g.disposeBoundsTree();
      }
      colliders.current = [];
    };
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    for (const c of colliders.current) {
      setColliderEnabled(c, enabled);
    }
  }, [enabled]);

  useEffect(() => {
    blocksCameraRef.current = blocksCamera;
    for (const c of colliders.current) {
      c.blocksCamera = blocksCamera;
    }
  }, [blocksCamera]);

  return <group ref={group}>{children}</group>;
}
