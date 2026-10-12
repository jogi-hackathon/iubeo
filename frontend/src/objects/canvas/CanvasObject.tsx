import {useEffect, useMemo, useRef} from "react";
import {BoxGeometry, type Group, MeshStandardMaterial} from "three";

import {BakeTarget} from "../../bake/BakeTarget";
import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
import {BVHCollider} from "../../core/bvh";
import {useControlLockWhileWorking} from "../controlLock";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {CanvasPaper} from "./CanvasPaper";
import {EASEL_PARTS, type EaselLook, type EaselPart} from "./easel";

const WHITE = "#ffffff";
const MATERIALS: Record<EaselLook, MeshStandardMaterial> = {
  wood: new MeshStandardMaterial({color: WHITE}),
  accent: new MeshStandardMaterial({color: WHITE}),
};

function Part({part, geometry}: {part: EaselPart; geometry: BoxGeometry}) {
  return (
    <mesh
      geometry={geometry}
      material={MATERIALS[part.look]}
      position={part.position}
      {...(part.rotation && {rotation: part.rotation})}
    />
  );
}

export function CanvasObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
  const {visible} = useObjectState();
  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["canvas"], root);
  const active = object.users.length > 0;
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) {
      sfx.play("canvas");
    }
    wasActive.current = active;
  }, [active, sfx]);
  const geometries = useMemo(
    () => EASEL_PARTS.map((part) => new BoxGeometry(...part.scale)),
    [],
  );
  useEffect(
    () => () => {
      for (const g of geometries) {
        g.dispose();
      }
    },
    [geometries],
  );

  return (
    <group ref={root}>
      <BVHCollider enabled={visible}>
        {EASEL_PARTS.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i] as BoxGeometry} />
        ))}
      </BVHCollider>
      <BakeTarget>
        <CanvasPaper active={active} />
      </BakeTarget>
    </group>
  );
}
