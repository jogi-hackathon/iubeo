import {type ReactNode, useLayoutEffect, useRef} from "react";
import type {Group, Mesh} from "three";

import {addBakeTarget, removeBakeTarget} from "./targets";

export function BakeTarget({children}: {children?: ReactNode}) {
  const group = useRef<Group>(null);

  useLayoutEffect(() => {
    const added: Mesh[] = [];
    group.current?.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && mesh.geometry) {
        addBakeTarget(mesh);
        added.push(mesh);
      }
    });
    return () => {
      for (const mesh of added) {
        removeBakeTarget(mesh);
      }
    };
  }, []);

  return <group ref={group}>{children}</group>;
}
