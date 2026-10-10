import {createPortal, useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Sprite} from "three/webgpu";

import {bakedAOErase} from "../../bake/aoErase";
import type {Vec3} from "../../props/types";
import {CORRUPT_SECONDS, directoryCorruption} from "./corruption";
import {createFireMaterial, fireParamsFor, IGNITE_SECONDS} from "./fire";
import {mountainReach, type MountainSizeName} from "./mountain";

const AO_ERASE_REACH = 1.3;
const FIRE_FADE_RATIO = 0.25;

/**
 * ディレクトリが燃える演出。マウントした時点から、炎の粒(fire.ts)が IGNITE_SECONDS かけて回り、
 * 山の侵食(corruption.ts)が CORRUPT_SECONDS かけて進んで、山が抜けていく。山が抜けきる終わりの方では、炎の粒も減らして消す。
 * 床などに焼いた山の影(ベイク AO)も、侵食に合わせて山の足元の円の中だけ消す(焼け跡が残らないように)。
 * アンマウント(火が消えた。ローカルの開発用の切り替えなど)で、侵食と影の消し具合を 0 に戻す。
 *
 * シーンの直下にポータルで置く(ディレクトリの根の下に置かない)。根の下に置くと、山を狙ったときのアウトライン(OutlineNode)が
 * 炎の粒まで選択の子孫として描き直し、狙いの判定(レイキャスト)も粒に当たるため。位置は山の足元(レイアウトの位置)
 */
export function DirectoryFire({
  position,
  size,
}: {
  position: Vec3;
  size: MountainSizeName;
}) {
  const scene = useThree((s) => s.scene);
  const {sprite, ignition} = useMemo(() => {
    const params = fireParamsFor(size);
    const {material, ignition} = createFireMaterial(params);
    const sprite = new Sprite(material);
    sprite.count = params.count;
    // 粒はシェーダーで山じゅうに散らすので、Sprite 自体の境界(原点の 1 枚)で視錐台カリングしない
    sprite.frustumCulled = false;
    sprite.raycast = () => {};
    return {sprite, ignition};
  }, [size]);
  useEffect(
    () => () => {
      sprite.material.dispose();
    },
    [sprite],
  );

  useEffect(() => {
    bakedAOErase.center.value.set(position[0], position[2]);
    bakedAOErase.radius.value = mountainReach(size) * AO_ERASE_REACH;
    return () => {
      directoryCorruption.progress.value = 0;
      bakedAOErase.amount.value = 0;
    };
  }, [position, size]);

  const startedAt = useRef<number | null>(null);
  useFrame(({clock}) => {
    startedAt.current ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const progress = Math.min(1, elapsed / CORRUPT_SECONDS);
    directoryCorruption.progress.value = progress;
    bakedAOErase.amount.value = progress;
    ignition.value = Math.min(
      1,
      elapsed / IGNITE_SECONDS,
      (1 - progress) / FIRE_FADE_RATIO,
    );
  });

  return createPortal(
    <group position={position}>
      <primitive object={sprite} />
    </group>,
    scene,
  );
}
