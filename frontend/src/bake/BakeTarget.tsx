import {type ReactNode, useLayoutEffect, useRef} from "react";
import type {Group, Mesh} from "three";

import {addBakeTarget, removeBakeTarget} from "./targets";

/**
 * 子孫の mesh を、コライダーにはせずに AO のベイク対象として登録する(マウント後に追加された mesh は対象外)。
 * ジオメトリには index・normal・uv(チャートごとに [0,1]²)と、チャートを分ける groups が要る(meshes.ts の assignCharts)。
 * AO モード(aoMode.ts)が realtime の mesh は、登録しても対象にならない
 */
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
