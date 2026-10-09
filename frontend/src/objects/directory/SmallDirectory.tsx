import type {GameObject} from "../types";
import {DirectoryView} from "./DirectoryView";
import {useDirectory} from "./useDirectory";

/**
 * 小さい山(room のような狭い部屋用)。段数・半径・高さが large より小さい。
 * 山の形は固定の seed と look で決まるので、ベイクするシーンの置き方と合わせる
 */
export function SmallDirectory({object}: {object: GameObject}) {
  return <DirectoryView {...useDirectory(object, "small")} />;
}
