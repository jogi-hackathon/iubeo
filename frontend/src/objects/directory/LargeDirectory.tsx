import type {GameObject} from "../types";
import {DirectoryView} from "./DirectoryView";
import {useDirectory} from "./useDirectory";

/** 大きい山(既定)。段数・半径・高さが大きい */
export function LargeDirectory({object}: {object: GameObject}) {
  return <DirectoryView {...useDirectory(object, "large")} />;
}
