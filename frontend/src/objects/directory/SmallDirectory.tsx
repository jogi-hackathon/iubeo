import type {GameObject} from "../types";
import {DirectoryView} from "./DirectoryView";
import {useDirectory} from "./useDirectory";

export function SmallDirectory({object}: {object: GameObject}) {
  return <DirectoryView {...useDirectory(object, "small")} />;
}
