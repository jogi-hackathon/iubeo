import {useEffect, useMemo} from "react";

import type {Vec3} from "../../props/types";
import {useInteraction} from "../interaction/useInteraction";
import {type DirectoryLook, featureKey} from "../layout";
import {useLayoutSlot} from "../layoutContext";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {parseDirectoryData, type StockFile} from "./data";
import {buildCoreGeometry, buildSheetsGeometry} from "./geometry";
import {directoryInteractionFor} from "./interaction";
import {buildMountain, DIRECTORY_MOUNTAIN_SEED} from "./mountain";
import {overview, useIsOverviewing} from "./overview";
import {createPaperMaterial} from "./paperMaterial";

/** ディレクトリの見た目を描くのに要る値。SmallDirectory・LargeDirectory が同じ形で DirectoryView に渡す */
export type DirectoryModel = {
  objectId: string;
  /** 足元の位置(レイアウトの項目から。俯瞰ビューが使う) */
  position: Vec3;
  look: DirectoryLook;
  stock: StockFile[];
  outputs: number;
  mountain: ReturnType<typeof buildMountain>;
  coreGeometry: ReturnType<typeof buildCoreGeometry>;
  sheetsGeometry: ReturnType<typeof buildSheetsGeometry>;
  paperMaterial: ReturnType<typeof createPaperMaterial>;
  /** 俯瞰中か */
  overviewing: boolean;
  /** 表示中か(非表示の間は、山にぶつからないようコライダーを無効にする) */
  visible: boolean;
};

/** 俯瞰を一人称へ戻す(このディレクトリが俯瞰中のときだけ) */
const resetOverviewOf = (directoryId: string): void => {
  if (overview.getState().directoryId === directoryId) {
    overview.reset();
  }
};

/**
 * ディレクトリの共通部分。山の形は固定の seed と look で決まる(id には依らない)。
 * 項目名(レイアウト)から俯瞰の機能のキーを決め、インタラクトを登録する。
 * 俯瞰中のこのディレクトリが消えたとき・機能 OFF・非表示になったときは、俯瞰を一人称へ戻す
 */
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
