import type {Candidate} from "./mountain";

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
