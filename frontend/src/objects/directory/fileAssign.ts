import type {Candidate} from "./mountain";

/**
 * 俯瞰 1 回分(入ってから出るまで)の、在庫ファイルと束(候補)の割り当て。山の束のうち、下の方の段で
 * 真上から見える候補の中から、ファイルごとに 1 つをランダムに割り当てる。
 * - 割り当ては、俯瞰に入るたびに新しくやり直す(呼び出し側が入るたびに作る)。一人称では色が見えないので、見た目は跳ばない。
 *   乱数は注入できる(テスト用)
 * - 一度割り当てたファイルは、俯瞰の間は動かない。他の人の借用・返却で在庫が変わっても、既存の割り当てはそのまま。
 *   新しく現れたファイルは、空いている束に足す。いま在庫に無い(借りられている)ファイルの束も確保したままにして、
 *   返却されたら元の束に戻す
 */
export const createFileAssigner = (
  candidateCount: number,
  random: () => number = Math.random,
) => {
  const assigned = new Map<string, number>();

  const assign = (id: string, present: ReadonlySet<string>): void => {
    const taken = new Set(assigned.values());
    let free: number[] = [];
    for (let i = 0; i < candidateCount; i++) {
      if (!taken.has(i)) {
        free.push(i);
      }
    }
    if (free.length === 0) {
      const inUse = new Set(
        [...assigned].filter(([k]) => present.has(k)).map(([, v]) => v),
      );
      free = Array.from({length: candidateCount}, (_, i) => i).filter(
        (i) => !inUse.has(i),
      );
    }
    const index = free[Math.floor(random() * free.length)];
    if (index !== undefined) {
      assigned.set(id, index);
    }
  };

  return {
    sync: (ids: readonly string[]): void => {
      const present = new Set(ids);
      for (const id of ids) {
        if (!assigned.has(id)) {
          assign(id, present);
        }
      }
    },
    get: (id: string): number | undefined => assigned.get(id),
  };
};

export type FileAssigner = ReturnType<typeof createFileAssigner>;

/** 視線の当たり判定に使う板(束の上面)。座標はワールド座標(x・z は中心、y は上面の高さ) */
export type FilePlate = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
};

type Point = {x: number; y: number; z: number};

/** 候補の束の上面を、ワールド座標の板にする(base はディレクトリの足元の位置) */
export const plateOf = (
  id: string,
  c: Candidate,
  base: readonly [number, number, number],
  lift = 0,
): FilePlate => ({
  id,
  x: base[0] + c.x,
  y: base[1] + c.topY + lift,
  z: base[2] + c.z,
  yaw: c.yaw,
  width: c.width,
  depth: c.depth,
});

/**
 * 視線(origin から direction)が当たっているファイルの id。板ごとに、その上面の高さの水平面との交点を、
 * 板のローカル座標(yaw だけ回っている)に直して、矩形の中に入っていれば当たり。
 * 高さが板ごとに違うので、当たったもののうち、カメラに最も近いものを選ぶ。pad は当たり判定の余白(m)
 */
export const pickFile = (
  origin: Point,
  direction: Point,
  plates: readonly FilePlate[],
  pad = 0.04,
): string | null => {
  let best: {id: string; t: number} | null = null;
  for (const p of plates) {
    if (direction.y >= 0 || origin.y <= p.y) {
      continue;
    }
    const t = (p.y - origin.y) / direction.y;
    const dx = origin.x + direction.x * t - p.x;
    const dz = origin.z + direction.z * t - p.z;
    const cos = Math.cos(p.yaw);
    const sin = Math.sin(p.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (
      Math.abs(lx) <= p.width / 2 + pad &&
      Math.abs(lz) <= p.depth / 2 + pad &&
      (!best || t < best.t)
    ) {
      best = {id: p.id, t};
    }
  }
  return best?.id ?? null;
};
