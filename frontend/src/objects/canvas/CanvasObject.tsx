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

/**
 * キャンバス: イーゼルに立てかけた絵の面のモック(Image Generation のタスクで使う場所)。寸法と部品の配置は easel.ts。
 *
 * - AO はベイクだけ(baked。GTAO は掛けない)。キャンバスは動かず、形は固定なので、シーンと一緒に焼ける
 *   (`pnpm bake:ao`。ベイクページも同じ位置でキャンバスを置く)。位置・部品を変えたり、置くキャンバスの数が変わったら再ベイクが要る。
 *   ベイク結果と合わない間は、シーン全体のベイク AO が外れる(BakedAO)
 *   AO の出し方は、置かれたシーンが決める(既定は baked。room のように出し入れするシーンは、影が残らないよう ManagedObjects の ao で realtime にする)
 * - イーゼルの部品はコライダー(BVHCollider。コライダーの mesh はそのままベイク対象にもなる)。表示しない間は当たらない。紙はコライダーにせずベイク対象としてだけ登録する(BakeTarget)
 *   当たり判定は mesh の拡大を等倍としか扱えないので、部品は scale で伸ばさず、寸法どおりの BoxGeometry で作る
 * - 部品はすべて同じオブジェクト(ObjectRoot)の配下なので、どこを狙ってもキャンバスに当たり、アウトラインは全体の外周に 1 本付く
 */
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
