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
  const stockCount = parseDirectoryData(object.data).stock.length;
  const lastCount = useRef(stockCount);
  useEffect(() => {
    if (stockCount < lastCount.current) {
      sfx.play("filePick");
    } else if (stockCount > lastCount.current) {
      sfx.play("save");
    }
    lastCount.current = stockCount;
  }, [stockCount, sfx]);
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
