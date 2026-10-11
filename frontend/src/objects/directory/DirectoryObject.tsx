import {useTeamState} from "../../authority/team";
import {useDisableObjectWhile} from "../disabledObjects";
import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {DirectoryFire} from "./DirectoryFire";
import {LargeDirectory} from "./LargeDirectory";
import {SmallDirectory} from "./SmallDirectory";

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
