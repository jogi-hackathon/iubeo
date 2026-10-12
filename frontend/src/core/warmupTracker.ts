import type {Material, Object3D} from "three";

export const WARMUP_STABLE_MS = 500;
export const WARMUP_MAX_MS = 10_000;
/**
 * 時間が経っていても、最低この回数は描く。タブが隠れていてフレームが進まないまま時間だけ過ぎると、
 * 表示に戻った最初のフレームで打ち切られて何も描けないため。アウトラインの選択の切り替え(2 フレーム周期)を 2 周ぶん
 */
export const WARMUP_MIN_FRAMES = 4;

const materialsOf = (o: Object3D): Material[] => {
  const m = (o as {material?: Material | Material[]}).material;
  if (!m) {
    return [];
  }
  return Array.isArray(m) ? m : [m];
};

export const sceneSignature = (root: Object3D): string => {
  const parts: string[] = [];
  root.traverse((o) => {
    for (const m of materialsOf(o)) {
      parts.push(`${o.id}:${m.uuid}:${m.version}`);
    }
  });
  return parts.join(",");
};

export interface WarmupTracker {
  update(signature: string, now: number, held?: boolean): boolean;
}

export const createWarmupTracker = (start: number): WarmupTracker => {
  let last = "";
  let changedAt = start;
  let frames = 0;
  return {
    update: (signature, now, held = false) => {
      if (held || signature !== last) {
        last = signature;
        changedAt = now;
      }
      if (frames < WARMUP_MIN_FRAMES) {
        frames++;
        return false;
      }
      return (
        now - changedAt >= WARMUP_STABLE_MS || now - start >= WARMUP_MAX_MS
      );
    },
  };
};
