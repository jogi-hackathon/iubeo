import {useTeamState} from "../../authority/team";
import {useDisableObjectWhile} from "../disabledObjects";
import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {DirectoryFire} from "./DirectoryFire";
import {LargeDirectory} from "./LargeDirectory";
import {SmallDirectory} from "./SmallDirectory";

/**
 * ディレクトリ: 書類の束を段々(テラス)に積んだ山(手続き生成)。上へ行くほど狭くなる段の外周の帯に、束(薄い板の小さな山積み)を並べる。
 * 山の大きさは、レイアウトの項目の look で決まる(small は room のような狭い部屋用、既定は large)。
 * 向きは持たない(山は回さない)。位置は項目の position
 * 在庫のファイルは山の束の 1 つ 1 つ。手ぶらでインタラクトすると、俯瞰ビュー(DirectoryOverview)で取り出すファイルを選ぶ。
 * チームの fireStarted(ライターで火をつけた)の間は、山が燃えて抜けていく(DirectoryFire)。その間は機能を止める
 * (狙えない・縁取りが付かない。抜けた山の形の縁取りが残らないように)
 */
export function DirectoryObject({object}: {object: GameObject}) {
  const {item} = useLayoutSlot();
  const {fireStarted} = useTeamState();
  const size = item.look === "small" ? "small" : "large";
  useDisableObjectWhile(object.id, fireStarted);
  return (
    <>
      {size === "small" ? (
        <SmallDirectory object={object} />
      ) : (
        <LargeDirectory object={object} />
      )}
      {fireStarted && <DirectoryFire position={item.position} size={size} />}
    </>
  );
}
