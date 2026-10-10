import type {Vec3} from "../props/types";
import type {GameObject} from "./types";

/** レイアウトの項目。項目名(レイアウトのキー)はトグル(core/toggles)のキーにもなる */
export type LayoutItem = {
  /** サーバー(またはローカルのオーソリティ)が付ける id。種類は id の接頭辞で決まる */
  id: string;
  /** 足元の位置(ワールド) */
  position: Vec3;
  /** Y 軸まわりの向き(ラジアン。省略は 0)。ディレクトリは持てない(→ DirectoryLayoutItem) */
  yaw?: number;
  /** 見た目の選び方。種類ごとに許す値が違う */
  look?: string;
};

/** ディレクトリの見た目。山の大きさ(room は small、sandbox は large) */
export type DirectoryLook = "small" | "large";

/**
 * ディレクトリの項目。向きは持てない(山は回さない。俯瞰ビューは向きを自前で決める)。
 * 見た目は省略なら large
 */
export type DirectoryLayoutItem = {
  id: string;
  position: Vec3;
  look?: DirectoryLook;
};

/** ディレクトリの項目を作る。yaw を渡すと、オブジェクトリテラルの過剰プロパティとして型エラーになる */
export const directoryItem = (item: DirectoryLayoutItem): LayoutItem => item;

/** シーンのレイアウト。キーが項目名 */
export type SceneLayout = Readonly<Record<string, LayoutItem>>;

/** id から種類を決める。接頭辞(最後の "-数字" より前)が種類(directory-1 → directory、dummy-3 → dummy) */
export const kindOfId = (id: string): string => id.replace(/-\d+$/, "");

/** 項目名 name の機能 feature のトグルのキー(例: directory と overview → directory:overview) */
export const featureKey = (name: string, feature: string): string =>
  `${name}:${feature}`;

/** オブジェクトを、レイアウトの項目に割り当てた結果 */
export type LayoutAssignment = {
  object: GameObject;
  name: string;
  item: LayoutItem;
};

export type LayoutMatch = {
  /** 項目が見つかったオブジェクト(描く・インタラクトの対象) */
  assigned: LayoutAssignment[];
  /** どの項目にも当てはまらないオブジェクト(描かない) */
  unmatched: GameObject[];
};

/**
 * オブジェクトを id で項目に割り当てる。同じ id の項目が複数あれば、先に書いた物を使う。
 * 割り当て順はオブジェクトの順のまま
 */
export const matchLayout = (
  layout: SceneLayout,
  objects: readonly GameObject[],
): LayoutMatch => {
  const byId = new Map<string, {name: string; item: LayoutItem}>();
  for (const [name, item] of Object.entries(layout)) {
    if (!byId.has(item.id)) {
      byId.set(item.id, {name, item});
    }
  }
  const assigned: LayoutAssignment[] = [];
  const unmatched: GameObject[] = [];
  for (const object of objects) {
    const hit = byId.get(object.id);
    if (hit) {
      assigned.push({object, name: hit.name, item: hit.item});
    } else {
      unmatched.push(object);
    }
  }
  return {assigned, unmatched};
};
