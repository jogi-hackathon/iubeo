import {BufferAttribute, BufferGeometry, Vector3} from "three/webgpu";

type Corner = readonly [number, number, number];

export const createKeyCapGeometry = (
  width: number,
  depth: number,
  height: number,
  inset: number,
): BufferGeometry => {
  const hw = width / 2;
  const hd = depth / 2;
  const tw = Math.max(hw - inset, hw * 0.2);
  const td = Math.max(hd - inset, hd * 0.2);
  const y0 = -height / 2;
  const y1 = height / 2;
  const bottom: Corner[] = [
    [-hw, y0, -hd],
    [hw, y0, -hd],
    [hw, y0, hd],
    [-hw, y0, hd],
  ];
  const top: Corner[] = [
    [-tw, y1, -td],
    [tw, y1, -td],
    [tw, y1, td],
    [-tw, y1, td],
  ];

  const positions: number[] = [];
  const indices: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const quad = (corners: readonly Corner[], outward: Corner) => {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
    }
    a.set(...corners[0]!);
    b.set(...corners[1]!).sub(a);
    c.set(...corners[2]!).sub(a);
    const flipped = b.cross(c).dot(new Vector3(...outward)) < 0;
    const order = flipped ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    indices.push(...order.map((i) => base + i));
  };

  quad(top, [0, 1, 0]);
  quad(bottom, [0, -1, 0]);
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const mid = bottom[i]!;
    const next = bottom[j]!;
    quad(
      [bottom[i]!, bottom[j]!, top[j]!, top[i]!],
      [(mid[0] + next[0]) / 2, 0, (mid[2] + next[2]) / 2],
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};
