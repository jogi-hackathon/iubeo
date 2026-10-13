import {useEffect, useRef} from "react";
import type {Group} from "three";

import {useTeamState} from "../../authority/team";
import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
import {useDisableObjectWhile} from "../disabledObjects";
import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {parseDirectoryData} from "./data";
import {DirectoryFire} from "./DirectoryFire";
import {LargeDirectory} from "./LargeDirectory";
import {SmallDirectory} from "./SmallDirectory";

export function DirectoryObject({object}: {object: GameObject}) {
  const {item} = useLayoutSlot();
  const {fireStarted} = useTeamState();
  const size = item.look === "small" ? "small" : "large";
  useDisableObjectWhile(object.id, fireStarted);

  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["filePick", "save", "corrupt"], root);
  const directory = parseDirectoryData(object.data);
  const stockCount = directory.stock.length;
  const outputs = directory.outputs;
  const last = useRef({stockCount, outputs});
  useEffect(() => {
    if (stockCount < last.current.stockCount) {
      sfx.play("filePick");
    } else if (
      stockCount > last.current.stockCount ||
      outputs > last.current.outputs
    ) {
      sfx.play("save");
    }
    last.current = {stockCount, outputs};
  }, [stockCount, outputs, sfx]);
  useEffect(() => {
    if (fireStarted) {
      sfx.play("corrupt");
      return () => sfx.stop("corrupt");
    }
  }, [fireStarted, sfx]);

  return (
    <>
      <group ref={root} position={item.position} />
      {size === "small" ? (
        <SmallDirectory object={object} />
      ) : (
        <LargeDirectory object={object} />
      )}
      {fireStarted && <DirectoryFire position={item.position} size={size} />}
    </>
  );
}
