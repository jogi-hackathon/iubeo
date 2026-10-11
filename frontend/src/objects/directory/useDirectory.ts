import {useEffect, useMemo} from "react";

import type {Vec3} from "../../props/types";
import {useInteraction} from "../interaction/useInteraction";
import {type DirectoryLook, featureKey} from "../layout";
import {useLayoutSlot} from "../layoutContext";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {directoryCorruption} from "./corruption";
import {parseDirectoryData, type StockFile} from "./data";
import {buildCoreGeometry, buildSheetsGeometry} from "./geometry";
import {directoryInteractionFor} from "./interaction";
import {buildMountain, DIRECTORY_MOUNTAIN_SEED} from "./mountain";
import {overview, useIsOverviewing} from "./overview";
import {createPaperMaterial} from "./paperMaterial";

export type DirectoryModel = {
  objectId: string;
  position: Vec3;
  look: DirectoryLook;
  stock: StockFile[];
  outputs: number;
  mountain: ReturnType<typeof buildMountain>;
  coreGeometry: ReturnType<typeof buildCoreGeometry>;
  sheetsGeometry: ReturnType<typeof buildSheetsGeometry>;
  paperMaterial: ReturnType<typeof createPaperMaterial>;
  overviewing: boolean;
  visible: boolean;
};

const resetOverviewOf = (directoryId: string): void => {
  if (overview.getState().directoryId === directoryId) {
    overview.reset();
  }
};

export function useDirectory(
  object: GameObject,
  look: DirectoryLook,
): DirectoryModel {
  const {name, item} = useLayoutSlot();
  const {stock, outputs} = useMemo(
    () => parseDirectoryData(object.data),
    [object.data],
  );
  const mountain = useMemo(
    () => buildMountain(DIRECTORY_MOUNTAIN_SEED, look),
    [look],
  );
  const coreGeometry = useMemo(
    () => buildCoreGeometry(mountain.core),
    [mountain],
  );
  useEffect(() => () => coreGeometry.dispose(), [coreGeometry]);
  const sheetsGeometry = useMemo(
    () => buildSheetsGeometry(mountain.sheets, mountain.looseSheets),
    [mountain],
  );
  useEffect(() => () => sheetsGeometry.dispose(), [sheetsGeometry]);
  useEffect(() => {
    directoryCorruption.baseY.value = item.position[1];
    directoryCorruption.height.value = mountain.height;
  }, [item.position, mountain]);
  const paperMaterial = useMemo(() => createPaperMaterial({merged: true}), []);
  useEffect(() => () => paperMaterial.dispose(), [paperMaterial]);
  const overviewKey = featureKey(name, "overview");
  const interaction = useMemo(
    () => directoryInteractionFor(overviewKey),
    [overviewKey],
  );
  useInteraction(object, interaction);
  const overviewing = useIsOverviewing(object.id);
  const {visible, enabled} = useObjectState();
  const objectId = object.id;
  useEffect(() => () => resetOverviewOf(objectId), [objectId]);
  useEffect(() => {
    if (!enabled) {
      resetOverviewOf(objectId);
    }
  }, [enabled, objectId]);
  return {
    objectId,
    position: item.position,
    look,
    stock,
    outputs,
    mountain,
    coreGeometry,
    sheetsGeometry,
    paperMaterial,
    overviewing,
    visible,
  };
}
