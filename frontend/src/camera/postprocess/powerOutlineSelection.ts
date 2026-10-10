import {type Object3D, Vector3} from "three";
import {uniform} from "three/tsl";

/*
 * 力の縁取り(赤く波打つ太めのアウトライン。pipeline の 2 つ目の OutlineNode)を付けるオブジェクトの管理。
 * 狙いの縁取り(outlineSelection)とは別で、複数の物が同時に入る(例: bypassPermission の後の、各席の机に置いてあるライター)。
 * 画面上で太さが決まる縁取りなので、離れると物に対して縁が太すぎて見える。カメラから FADE_START を超えると薄くし、FADE_END で消す。
 * 登録(addPowerOutline)と、OutlineNode に渡す選択(powerOutlineSelection)を分け、毎フレーム updatePowerOutline で
 * 距離を測って選択と濃さ(powerOutlineFade)を決める。FADE_END より遠い物は選択から外すので、縁取りのパスも止まる
 */

/** 薄くし始める距離(m) */
export const POWER_OUTLINE_FADE_START = 3;
/** 消えきる距離(m) */
export const POWER_OUTLINE_FADE_END = 4;

/** カメラからの距離での濃さ(0〜1)。FADE_START までは 1、FADE_END で 0。間はなめらかに(smoothstep)落とす */
export const powerOutlineFadeAt = (distance: number): number => {
  const t = Math.min(
    1,
    Math.max(
      0,
      (distance - POWER_OUTLINE_FADE_START) /
        (POWER_OUTLINE_FADE_END - POWER_OUTLINE_FADE_START),
    ),
  );
  return 1 - t * t * (3 - 2 * t);
};

type Entry = {object: Object3D; ignoreDistance: boolean};
const registered: Entry[] = [];
const selection: Object3D[] = [];

/** OutlineNode に参照で渡す選択。中身は updatePowerOutline が毎フレーム書き換える(配列は差し替えない) */
export const powerOutlineSelection: Object3D[] = selection;
/** 力の縁取りの濃さ(0〜1)。選択した物のうち一番近い物の濃さ。pipeline が縁のマスクに掛ける */
export const powerOutlineFade = uniform(0);

/**
 * 力の縁取りを付ける。戻り値で外す(2 回外しても何もしない)。
 * ignoreDistance は距離で薄くしない(シェーダーの事前コンパイルが、シーン全体を一時的に足す用)
 */
export const addPowerOutline = (
  object: Object3D,
  {ignoreDistance = false}: {ignoreDistance?: boolean} = {},
): (() => void) => {
  const entry: Entry = {object, ignoreDistance};
  registered.push(entry);
  return () => {
    const i = registered.indexOf(entry);
    if (i >= 0) {
      registered.splice(i, 1);
    }
  };
};

const worldPosition = new Vector3();

/** カメラの位置から、選択と濃さを決め直す(描画の直前に毎フレーム呼ぶ) */
export const updatePowerOutline = (cameraPosition: Vector3): void => {
  selection.length = 0;
  let fade = 0;
  for (const {object, ignoreDistance} of registered) {
    const f = ignoreDistance
      ? 1
      : powerOutlineFadeAt(
          object.getWorldPosition(worldPosition).distanceTo(cameraPosition),
        );
    if (f > 0) {
      selection.push(object);
      fade = Math.max(fade, f);
    }
  }
  powerOutlineFade.value = fade;
};
