import type {GameObject} from "../types";
import {DirectoryView} from "./DirectoryView";
import {useDirectory} from "./useDirectory";

export function LargeDirectory({object}: {object: GameObject}) {
  return <DirectoryView {...useDirectory(object, "large")} />;
}
