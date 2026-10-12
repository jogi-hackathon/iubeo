import type {Object3D} from "three";

/**
 * ウォームアップの 1 フレームのあいだ、root 以下の全オブジェクトを描かせる。
 * 非表示(visible=false)の物を表示し、視錐台カリングを切る。戻り値で、変えた物だけを元に戻す
 * (描画のあと、同じフレームの内に呼ぶ。フレームをまたぐと、その間に React が変えた visible を上書きしてしまう)
 */
export const exposeForWarmup = (root: Object3D): (() => void) => {
  const hidden: Object3D[] = [];
  const culled: Object3D[] = [];
  root.traverse((o) => {
    if (!o.visible) {
      o.visible = true;
      hidden.push(o);
    }
    if (o.frustumCulled) {
      o.frustumCulled = false;
      culled.push(o);
    }
  });
  return () => {
    for (const o of hidden) {
      o.visible = false;
    }
    for (const o of culled) {
      o.frustumCulled = true;
    }
  };
};

/** root 以下で最初に見つかる mesh(アウトラインの「1 つだけ選択」のパスを通す用) */
export const firstMeshOf = (root: Object3D): Object3D | null => {
  let found: Object3D | null = null;
  root.traverse((o) => {
    if (found === null && (o as {isMesh?: boolean}).isMesh) {
      found = o;
    }
  });
  return found;
};
