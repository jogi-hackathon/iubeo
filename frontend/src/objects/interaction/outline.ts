import {
  BackSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Vector3,
} from "three";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";

// 手元のアイテム(items/HeldItem)と同じ反転ハル。GTAO は掛けない(掛かると縁が灰色になる)
const HULL_MATERIAL = new MeshBasicMaterial({color: "#1a1a1a", side: BackSide});
setSkipGTAO(HULL_MATERIAL, true);

/** 元の大きさに対する倍率。オブジェクトの原点(インスタンスならそれぞれの中心)を基準に広げる */
const HULL_SCALE = 1.08;

const _scale = new Vector3(HULL_SCALE, HULL_SCALE, HULL_SCALE);
const _matrix = new Matrix4();

const noRaycast = () => {};

/**
 * root 配下の見える mesh に、反転ハルのアウトラインを付ける。戻り値は取り外す関数。
 * 見えない mesh(コライダー用など)には付けない。ハルはジオメトリを共有するので、外すとき dispose は要らない。
 * ハルは元の mesh の子にして、同じ変換に従わせる。付けた時点の形を写すので、インスタンスが変わったら付け直す
 */
export const applyOutline = (root: Object3D): (() => void) => {
  const sources: Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && mesh.visible && !mesh.userData.isOutlineHull) {
      sources.push(mesh);
    }
  });

  const hulls: Array<{parent: Mesh; hull: Mesh}> = [];
  for (const source of sources) {
    let hull: Mesh;
    if ((source as InstancedMesh).isInstancedMesh) {
      const instanced = source as InstancedMesh;
      const scaled = new InstancedMesh(
        source.geometry,
        HULL_MATERIAL,
        instanced.count,
      );
      // 各インスタンスの中心を基準に広げる(行列の右から掛ける)
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, _matrix);
        scaled.setMatrixAt(i, _matrix.scale(_scale));
      }
      scaled.instanceMatrix.needsUpdate = true;
      hull = scaled;
    } else {
      hull = new Mesh(source.geometry, HULL_MATERIAL);
      hull.scale.copy(_scale);
    }
    hull.userData.isOutlineHull = true;
    hull.frustumCulled = false;
    // 狙いの判定に、ハルが混ざらないようにする
    hull.raycast = noRaycast;
    source.add(hull);
    hulls.push({parent: source, hull});
  }

  return () => {
    for (const {parent, hull} of hulls) {
      parent.remove(hull);
      // インスタンスのハルだけは、行列のバッファを自前で持っている
      (hull as InstancedMesh).dispose?.();
    }
  };
};
