import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {LargeDirectory} from "./LargeDirectory";
import {SmallDirectory} from "./SmallDirectory";

/**
 * ディレクトリ: 書類の束を段々(テラス)に積んだ山(手続き生成)。上へ行くほど狭くなる段の外周の帯に、束(薄い板の小さな山積み)を並べる。
 * 山の大きさは、レイアウトの項目の look で決まる(small は room のような狭い部屋用、既定は large)。
 * 向きは持たない(山は回さない)。位置は項目の position
 * 在庫のファイルは山の束の 1 つ 1 つ。手ぶらでインタラクトすると、俯瞰ビュー(DirectoryOverview)で取り出すファイルを選ぶ
 */
export function DirectoryObject({object}: {object: GameObject}) {
  const {item} = useLayoutSlot();
  return item.look === "small" ? (
    <SmallDirectory object={object} />
  ) : (
    <LargeDirectory object={object} />
  );
}
