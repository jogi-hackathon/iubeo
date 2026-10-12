import {useEffect, useMemo} from "react";
import {BoxGeometry, MeshStandardMaterial} from "three";

import {BakeTarget} from "../../bake/BakeTarget";
import {useControlLockWhileWorking} from "../controlLock";
import type {GameObject} from "../types";
import {CanvasPaper} from "./CanvasPaper";
import {
  EASEL_PARTS,
  type EaselLook,
  type EaselPart,
  placementProps,
} from "./easel";

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
      {...placementProps(part)}
    />
  );
}

export function CanvasObject({object}: {object: GameObject}) {
  useControlLockWhileWorking(object);
  const geometries = useMemo(
    () => EASEL_PARTS.map(() => new BoxGeometry(1, 1, 1)),
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
    <group>
      {/* 位置・部品・置く数を変えたら再ベイクが要る。合わない間はシーン全体のベイク AO が外れる */}
      <BakeTarget>
        {EASEL_PARTS.map((part, i) => (
          <Part key={i} part={part} geometry={geometries[i] as BoxGeometry} />
        ))}
        <CanvasPaper active={object.users.length > 0} />
      </BakeTarget>
    </group>
  );
}
