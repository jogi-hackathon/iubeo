import {Color, type Object3D, Vector3} from "three";
import {uniform} from "three/tsl";

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

export const POWER_OUTLINE_DEFAULT_COLOR = "#ff1f2e";

type Entry = {object: Object3D; ignoreDistance: boolean; color: string};
const registered: Entry[] = [];
const selection: Object3D[] = [];

/** OutlineNode に参照で渡す選択。中身は updatePowerOutline が毎フレーム書き換える(配列は差し替えない) */
export const powerOutlineSelection: Object3D[] = selection;
/** 力の縁取りの濃さ(0〜1)。選択した物のうち一番近い物の濃さ。pipeline が縁のマスクに掛ける */
export const powerOutlineFade = uniform(0);
export const powerOutlineColor = uniform(
  new Color(POWER_OUTLINE_DEFAULT_COLOR),
);

/**
 * 力の縁取りを付ける。戻り値で外す(2 回外しても何もしない)。
 * ignoreDistance は距離で薄くしない(シェーダーの事前コンパイルが、シーン全体を一時的に足す用)
 */
export const addPowerOutline = (
  object: Object3D,
  {
    ignoreDistance = false,
    color = POWER_OUTLINE_DEFAULT_COLOR,
  }: {ignoreDistance?: boolean; color?: string} = {},
): (() => void) => {
  const entry: Entry = {object, ignoreDistance, color};
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
  let color: string | null = null;
  for (const {object, ignoreDistance, color: entryColor} of registered) {
    const f = ignoreDistance
      ? 1
      : powerOutlineFadeAt(
          object.getWorldPosition(worldPosition).distanceTo(cameraPosition),
        );
    if (f > 0) {
      selection.push(object);
      fade = Math.max(fade, f);
      color ??= entryColor;
    }
  }
  powerOutlineFade.value = fade;
  powerOutlineColor.value.set(color ?? POWER_OUTLINE_DEFAULT_COLOR);
};
