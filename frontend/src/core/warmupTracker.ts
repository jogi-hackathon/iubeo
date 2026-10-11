import type {Material, Object3D} from "three";

/**
 * シーンのマテリアル構成がこの時間変わらなければ、読み込みが落ち着いたとみなす(ベイク AO の aoMap 貼り付けなどを待つ)。
 * 非同期でマテリアルを差し替える読み込みは holdShaderWarmup() で明示的に待たせる決まりなので、
 * ここは「知らないうちに構成が変わった」を取りこぼさないための短い保険でよい(長くすると、その分だけ操作できない時間が伸びる)
 */
export const WARMUP_STABLE_MS = 150;
/**
 * 構成が落ち着いていても、最低これだけの回数は描き直す。
 * ウォームアップの描画は OutlineNode の選択を 1 フレームごとに「シーン全体」と「mesh 1 つ」で入れ替えるので、2 回で両方の経路を通る。
 * 端末が遅くてフレームの間隔が長いときでも、回数を時間で削らないための下限
 */
export const WARMUP_STABLE_FRAMES = 2;
/** 構成が落ち着かなくても、この時間で打ち切る */
export const WARMUP_MAX_MS = 10_000;

const materialsOf = (o: Object3D): Material[] => {
  const m = (o as {material?: Material | Material[]}).material;
  if (!m) {
    return [];
  }
  return Array.isArray(m) ? m : [m];
};

/**
 * パイプラインの作り直しにつながる構成の目印。mesh の増減と、マテリアルの差し替え・needsUpdate(version)を拾う。
 * uniform の値やテクスチャの中身の変化は含めない(再コンパイルは起きない)
 */
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
  /** 毎フレーム呼ぶ。held の間は落ち着いたとみなさない。true を返したら打ち切ってよい */
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
        frames = 0;
      }
      frames++;
      return (
        (now - changedAt >= WARMUP_STABLE_MS &&
          frames >= WARMUP_STABLE_FRAMES) ||
        now - start >= WARMUP_MAX_MS
      );
    },
  };
};
