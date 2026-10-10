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

/*
 * ベイク AO を、決めた円の中だけ消す仕組み。焼いた後で消えた物(燃えて抜けたディレクトリの山)の影が、
 * 床などに焼き付いたまま残らないようにする。
 * BakedAO が、アトラスを貼るノードのマテリアル(NodeMaterial)の aoNode に erasableBakedAO を付ける
 * (普通のマテリアルは aoNode を持たないので、消せない。消したい物はノードのマテリアルにする)。
 * 円と消す強さは、消える物の側(DirectoryFire)が書く。シーンにディレクトリは 1 つなので、共有の uniform にする
 */
export const bakedAOErase = {
  /** 円の中心(ワールドの x, z) */
  center: uniform(new Vector2()),
  /** 円の半径(m)。縁の 2 割で、なめらかに元の AO へ戻す */
  radius: uniform(1),
  /** 消す強さ(0: 元の AO、1: 円の中は影なし) */
  amount: uniform(0),
};

/** 消す円の縁の、ぼかす幅(半径に対する割合) */
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
