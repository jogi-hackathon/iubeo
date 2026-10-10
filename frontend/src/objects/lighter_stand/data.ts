import type {JsonValue} from "../../core/json";

/** ライターの置き場。サーバーでの名前のまま(state-schema §5.5) */
export const LIGHTER_STAND_KIND = "lighter_stand";

/** 置き場の data。hasLighter は置き場にライターがあるか(持ち主が持っている間は false) */
export type LighterStandData = {
  hasLighter: boolean;
};

/**
 * data を LighterStandData として読む。読めなければ「ライターは無い」とみなす
 * (持たれているライターを置き場に描いてしまうより、描かない方が害が小さい)
 */
export const parseLighterStandData = (data: JsonValue): LighterStandData => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {hasLighter: false};
  }
  return {hasLighter: data.hasLighter === true};
};

/** 置き場の id から、そこに置くライターの id を決める(lighter_stand-2 → lighter-2。サーバーの約束と同じ。state-schema §5.5) */
export const lighterIdOf = (standId: string): string =>
  standId.replace(/^lighter_stand-/, "lighter-");
