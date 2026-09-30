import type {Object3D} from "three";

/**
 * prop ごとの AO の出し方。
 * - baked: ベイク対象。面の AO はベイク AO だけ(GTAO は掛けない。画面端のちらつき・ノイズが乗らない)
 * - realtime: ベイク対象外(遮蔽物としても使わない)。面の AO は GTAO だけ。動く物・uv の無い物向け
 * - both: ベイク対象。面の AO はベイク AO と GTAO の暗い方。realtime の物が載る床など、動く物の接地の暗がりが要る面向け
 *
 * ao を実行中に変えても、反映は次のコライダー変化(再マウント)時。realtime との切り替えはベイク対象が変わるので再ベイクが必要
 * (baked と both の切り替えはベイク対象が同じなので再ベイクは要らない)
 */
export type AOMode = "baked" | "realtime" | "both";

export const DEFAULT_AO_MODE: AOMode = "baked";

const AO_MODE_KEY = "aoMode";

/** mesh / group の userData に渡す。未指定なら祖先の指定(無ければ DEFAULT_AO_MODE)に従う */
export const aoModeUserData = (mode?: AOMode): Record<string, unknown> =>
  mode ? {[AO_MODE_KEY]: mode} : {};

/** 自身から祖先へたどって最初に見つかった指定。GLTF などは親の group に付ければ配下の mesh 全体に効く */
export const aoModeOf = (obj: Object3D): AOMode => {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    const mode = o.userData[AO_MODE_KEY] as AOMode | undefined;
    if (mode) {
      return mode;
    }
  }
  return DEFAULT_AO_MODE;
};

/** マテリアルを使う mesh のモードから、そのマテリアルで GTAO を省けるか。1つでも both があれば GTAO も要る */
export const skipsGTAO = (modes: Iterable<AOMode>): boolean => {
  let any = false;
  for (const m of modes) {
    if (m !== "baked") {
      return false;
    }
    any = true;
  }
  return any;
};
