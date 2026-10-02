import type {Object3D} from "three";

const selection: Object3D[] = [];

/**
 * アウトラインを付けるオブジェクトの根のリスト。OutlineNode(pipeline)に参照で渡す配列そのもの。
 * OutlineNode は毎フレームこの中身を読み、各根の子孫の mesh もまとめて対象にする
 */
export const outlineSelection: Object3D[] = selection;

/** アウトラインの対象を入れ替える(空配列で解除)。OutlineNode が参照を持ち続けるので、配列は差し替えずに中身だけ書き換える */
export const setOutlineSelection = (objects: readonly Object3D[]): void => {
  selection.length = 0;
  selection.push(...objects);
};
