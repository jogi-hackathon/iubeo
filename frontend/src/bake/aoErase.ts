import {Vector2} from "three";
import {
  distance,
  float,
  materialAO,
  mix,
  positionWorld,
  smoothstep,
  uniform,
} from "three/tsl";
import type {Node} from "three/webgpu";

export const bakedAOErase = {
  /** 円の中心(ワールドの x, z) */
  center: uniform(new Vector2()),
  /** 円の半径(m)。縁の 2 割で、なめらかに元の AO へ戻す */
  radius: uniform(1),
  /** 消す強さ(0: 元の AO、1: 円の中は影なし) */
  amount: uniform(0),
};

const EDGE_RATIO = 0.2;

/** ベイク AO(materialAO。強さ込み)を、円の中だけ amount に応じて 1(影なし)へ寄せたもの */
export const erasableBakedAO = (): Node<"float"> => {
  const {center, radius, amount} = bakedAOErase;
  const d = distance(positionWorld.xz, center);
  const inside = float(1).sub(
    smoothstep(radius.mul(1 - EDGE_RATIO), radius, d),
  );
  return mix(materialAO, float(1), inside.mul(amount));
};
