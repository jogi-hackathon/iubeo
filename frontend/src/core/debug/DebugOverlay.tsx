import {useEffect, useState} from "react";
import {Box3, Box3Helper, Group} from "three";

import {listColliders} from "../bvh/registry";
import {DebugInfo} from "./DebugInfo";
import {useDebugFlags} from "./flags";
import {useDebugHotkeys} from "./useDebugHotkeys";

function BvhBounds() {
  const [group] = useState(() => new Group());

  useEffect(() => {
    const helpers: Box3Helper[] = [];
    for (const {mesh} of listColliders()) {
      const tree = mesh.geometry.boundsTree;
      if (!tree) {
        continue;
      }
      mesh.updateWorldMatrix(true, false);
      const box = tree
        .getBoundingBox(new Box3())
        .applyMatrix4(mesh.matrixWorld);
      const helper = new Box3Helper(box, 0xffcc00);
      helpers.push(helper);
      group.add(helper);
    }
    return () => {
      for (const h of helpers) {
        group.remove(h);
        h.dispose();
      }
    };
  }, [group]);

  return <primitive object={group} />;
}

export function DebugOverlay() {
  useDebugHotkeys();
  const {stats, grid, bvh} = useDebugFlags();

  return (
    <>
      {stats && <DebugInfo />}
      {grid && (
        <>
          <gridHelper args={[100, 100]} />
          <axesHelper args={[5]} />
        </>
      )}
      {bvh && <BvhBounds />}
    </>
  );
}
