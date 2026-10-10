import {Box3, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {mountainReach} from "../../../objects/directory/mountain";
import {overviewHeight} from "../../../objects/directory/overviewPose";
import {TOP_SIZE} from "../../../objects/workspace/desk";
import {CAPSULE_RADIUS, EYE_HEIGHT} from "../../../player/constants";
import {CHAIR_PARTS} from "../../../props/chairParts";
import type {Vec3} from "../../../props/types";
import {
  APEX_HEIGHT,
  PARTITION_AXIS,
  PARTITION_THICKNESS,
  SANDBOX_CIRCUMRADIUS,
  SANDBOX_LAYOUT,
  SANDBOX_INRADIUS,
  SANDBOX_SIDE,
  SEATS,
  WALL_HEIGHT,
  WALL_INNER_HALF_WIDTH,
  WALL_THICKNESS,
  WINDOW_CENTER_X,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
  ZONE_CANVAS,
  ZONE_CHAIR,
  ZONE_COUNT,
  ZONE_FLOOR,
  ZONE_PARTITION,
  ZONE_PC,
  ZONE_ROOF,
  ZONE_SPAWN,
  ZONE_WALLS,
  ZONE_WORKSPACE,
  type Placement,
  ridgeHeight,
  rotateY,
  sandboxSpawnOf,
  seatYaw,
  toWorld,
} from "../layout";

const r = SANDBOX_INRADIUS;
const t = WALL_THICKNESS;
const pt = PARTITION_THICKNESS;
const Y_AXIS = new Vector3(0, 1, 0);
const ZONES = Array.from({length: ZONE_COUNT}, (_, i) => i);
const zoneYaw = (zone: number): number => seatYaw(zone + 1);
const CLEAR = 0.3;
const MOUNTAIN_REACH = mountainReach("large");

type XZ = readonly [number, number];

const footprint = (placement: Placement, [x0, x1]: XZ, [z0, z1]: XZ): XZ[] =>
  (
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as XZ[]
  ).map(([x, z]) => {
    const p = new Vector3(x, 0, z).applyAxisAngle(Y_AXIS, placement.yaw);
    return [placement.position[0] + p.x, placement.position[2] + p.z] as XZ;
  });

const DESK_RANGE: [XZ, XZ] = [
  [-TOP_SIZE[0] / 2, TOP_SIZE[0] / 2],
  [-TOP_SIZE[2] / 2, TOP_SIZE[2] / 2],
];
const CHAIR_BOX = CHAIR_PARTS.reduce(
  (box, part) =>
    box.union(
      new Box3().setFromCenterAndSize(
        new Vector3(...part.position),
        new Vector3(...part.size),
      ),
    ),
  new Box3(),
);
const CHAIR_RANGE: [XZ, XZ] = [
  [CHAIR_BOX.min.x, CHAIR_BOX.max.x],
  [CHAIR_BOX.min.z, CHAIR_BOX.max.z],
];
const CANVAS_RANGE: [XZ, XZ] = [
  [-0.49, 0.49],
  [-0.62, 0.32],
];

const toZoneLocal = (zone: number, [x, z]: XZ): XZ => {
  const p = new Vector3(x, 0, z).applyAxisAngle(Y_AXIS, -zoneYaw(zone));
  return [p.x, p.z];
};

const partitionDistances = ([x, z]: XZ): [number, number] => {
  const a = SANDBOX_SIDE / 2;
  const len = Math.hypot(a, r);
  return [(x * r + z * a) / len, (-x * r + z * a) / len];
};

const polygonAxes = (poly: XZ[]): XZ[] =>
  poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length] as XZ;
    return [-(q[1] - p[1]), q[0] - p[0]] as XZ;
  });

const overlaps = (a: XZ[], b: XZ[]): boolean =>
  ![...polygonAxes(a), ...polygonAxes(b)].some(([ax, az]) => {
    const pa = a.map(([x, z]) => x * ax + z * az);
    const pb = b.map(([x, z]) => x * ax + z * az);
    return (
      Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)
    );
  });

const worldPlacement = (zone: number, local: Placement) =>
  toWorld(local, zone + 1);

describe("sandbox の形", () => {
  it("室内は一辺 SANDBOX_SIDE の正三角形で、中心から頂点までが R = 2r、辺の中点までが r", () => {
    const a = SANDBOX_SIDE / 2;
    expect(r).toBeCloseTo(6.928, 3);
    expect(SANDBOX_CIRCUMRADIUS).toBeCloseTo(2 * r);
    expect(Math.hypot(a, r)).toBeCloseTo(SANDBOX_CIRCUMRADIUS);
    expect(2 * a).toBe(SANDBOX_SIDE);
  });

  it("隣の区画の左の頂点は、この区画の右の頂点と同じ位置(120° 回すと重なる)", () => {
    const left: Vec3 = [-SANDBOX_SIDE / 2, 0, r];
    const right: Vec3 = [SANDBOX_SIDE / 2, 0, r];
    for (const zone of ZONES) {
      const next = (zone + 1) % ZONE_COUNT;
      const l = rotateY(left, zoneYaw(next));
      const rr = rotateY(right, zoneYaw(zone));
      expect(l[0]).toBeCloseTo(rr[0]);
      expect(l[2]).toBeCloseTo(rr[2]);
    }
  });

  it("三角錐の頂点(APEX_HEIGHT)は、ディレクトリの俯瞰カメラ(山の中心の真上)より 1m 以上高い", () => {
    expect(overviewHeight("large") + 1).toBeLessThan(APEX_HEIGHT);
    expect(WALL_HEIGHT).toBeLessThan(APEX_HEIGHT);
  });

  it("zoneYaw は 120° ずつ。toWorld は three の rotation.y と同じ向きに回し、yaw に回転を足す", () => {
    expect(zoneYaw(0)).toBe(0);
    expect(zoneYaw(1)).toBeCloseTo((2 * Math.PI) / 3);
    expect(zoneYaw(2)).toBeCloseTo((4 * Math.PI) / 3);
    const local: Placement = {position: [3.5, 0.2, 6], yaw: 0.7};
    expect(toWorld(local, 1).position).toEqual(local.position);
    expect(toWorld(local, 1).yaw).toBe(0.7);
    for (const zone of [1, 2]) {
      const world = toWorld(local, zone + 1);
      const expected = new Vector3(...local.position).applyAxisAngle(
        Y_AXIS,
        zoneYaw(zone),
      );
      expect(world.position[0]).toBeCloseTo(expected.x);
      expect(world.position[1]).toBeCloseTo(expected.y);
      expect(world.position[2]).toBeCloseTo(expected.z);
      expect(world.yaw).toBeCloseTo(0.7 + zoneYaw(zone));
    }
  });

  it("3 区画のオブジェクトは、区画 0 を 120° ずつ回した位置・向き(中心からの距離が同じ)", () => {
    for (const local of [ZONE_WORKSPACE, ZONE_CHAIR, ZONE_PC, ZONE_CANVAS]) {
      const [p0, p1, p2] = ZONES.map((zone) => worldPlacement(zone, local));
      const dist = (p: Placement) => Math.hypot(p.position[0], p.position[2]);
      expect(dist(p1 as Placement)).toBeCloseTo(dist(p0 as Placement));
      expect(dist(p2 as Placement)).toBeCloseTo(dist(p0 as Placement));
      expect((p1 as Placement).yaw - (p0 as Placement).yaw).toBeCloseTo(
        (2 * Math.PI) / 3,
      );
      const back = new Vector3(...(p1 as Placement).position).applyAxisAngle(
        Y_AXIS,
        -zoneYaw(1),
      );
      expect(back.x).toBeCloseTo((p0 as Placement).position[0]);
      expect(back.z).toBeCloseTo((p0 as Placement).position[2]);
    }
  });
});

describe("外壁・窓", () => {
  const box = (wall: (typeof ZONE_WALLS)[number]) =>
    new Box3().setFromCenterAndSize(
      new Vector3(...wall.position),
      new Vector3(...wall.size),
    );
  const outerHalf = Math.sqrt(3) * (r + t);
  const insideWall = (x: number, y: number, z: number) =>
    ZONE_WALLS.some((w) => box(w).containsPoint(new Vector3(x, y, z)));

  it("外壁は z∈[r, r+t] で、外側の頂点(x = ±√3(r+t))まで届き、下端は床の板の中、上端は屋根の板の中(継ぎ目に隙間を作らない)", () => {
    const union = ZONE_WALLS.reduce((b, w) => b.union(box(w)), new Box3());
    expect(union.min.x).toBeCloseTo(-outerHalf);
    expect(union.max.x).toBeCloseTo(outerHalf);
    expect(union.min.y).toBeCloseTo(-t);
    const slope = (APEX_HEIGHT - WALL_HEIGHT) / r;
    const [, oy, oz] = ZONE_ROOF.offset;
    const roofTopAtOuterFace = APEX_HEIGHT - slope * (r + t) + slope * oz + oy;
    expect(union.max.y).toBeGreaterThan(WALL_HEIGHT);
    expect(union.max.y).toBeLessThanOrEqual(roofTopAtOuterFace);
    expect(union.min.z).toBeCloseTo(r);
    expect(union.max.z).toBeCloseTo(r + t);
  });

  it("外壁は、窓の正方形(一辺 WINDOW_SIZE、下端 WINDOW_SILL_HEIGHT)の空洞だけを残して壁を埋める", () => {
    const step = 0.25;
    const x0 = WINDOW_CENTER_X - WINDOW_SIZE / 2;
    for (let y = step / 2; y < WALL_HEIGHT; y += step) {
      for (let x = -outerHalf + step / 2; x < outerHalf; x += step) {
        const inWindow =
          y > WINDOW_SILL_HEIGHT &&
          y < WINDOW_SILL_HEIGHT + WINDOW_SIZE &&
          x > x0 &&
          x < x0 + WINDOW_SIZE;
        expect(insideWall(x, y, r + t / 2)).toBe(!inWindow);
      }
    }
  });

  it("窓は外壁の室内側の面の範囲に収まり、左右の仕切りの厚みと重ならない", () => {
    expect(WINDOW_CENTER_X).toBeCloseTo(0);
    expect(WINDOW_SIZE).toBe(2);
    expect(WINDOW_SILL_HEIGHT).toBe(1);
    const left = WINDOW_CENTER_X - WINDOW_SIZE / 2;
    const right = WINDOW_CENTER_X + WINDOW_SIZE / 2;
    expect(WALL_INNER_HALF_WIDTH).toBeCloseTo(Math.sqrt(3) * r - pt);
    expect(left).toBeGreaterThan(-WALL_INNER_HALF_WIDTH + CLEAR);
    expect(right).toBeLessThan(WALL_INNER_HALF_WIDTH - CLEAR);
    const [dl, dr] = partitionDistances([WALL_INNER_HALF_WIDTH, r]);
    expect(dr).toBeCloseTo(pt / 2);
    expect(dl).toBeGreaterThan(pt / 2);
    expect(WINDOW_SILL_HEIGHT + WINDOW_SIZE).toBeLessThan(WALL_HEIGHT);
  });

  it("窓の下端は目の高さより低く、上端は目の高さより高い(立って外が見える)", () => {
    expect(WINDOW_SILL_HEIGHT).toBeLessThan(EYE_HEIGHT);
    expect(WINDOW_SILL_HEIGHT + WINDOW_SIZE).toBeGreaterThan(EYE_HEIGHT);
  });
});

describe("床・仕切り・屋根", () => {
  const outerHalf = Math.sqrt(3) * (r + t);

  it("床は三角形 (0,0)・(±√3(r+t), r+t) の板で、上面が y=0、厚さ t", () => {
    expect(ZONE_FLOOR.polygon).toHaveLength(3);
    for (const [, y] of ZONE_FLOOR.polygon) {
      expect(y).toBe(0);
    }
    const xz = ZONE_FLOOR.polygon.map(([x, , z]) => [x, z]);
    expect(xz[0]).toEqual([0, 0]);
    expect(xz[1]?.[0]).toBeCloseTo(-outerHalf);
    expect(xz[2]?.[0]).toBeCloseTo(outerHalf);
    expect(xz[1]?.[1]).toBeCloseTo(r + t);
    expect(xz[2]?.[1]).toBeCloseTo(r + t);
    expect(ZONE_FLOOR.offset).toEqual([0, -t, 0]);
  });

  it("仕切りの厚さは壁より薄い(すりガラスの板)", () => {
    expect(PARTITION_THICKNESS).toBe(0.08);
    expect(PARTITION_THICKNESS).toBeLessThan(WALL_THICKNESS);
  });

  it("仕切りの面内の横軸 PARTITION_AXIS は、中心から頂点へ向かう水平な単位ベクトル", () => {
    const axis = new Vector3(...PARTITION_AXIS);
    expect(axis.y).toBe(0);
    expect(axis.length()).toBeCloseTo(1);
    const [x0, , z0] = ZONE_PARTITION.polygon[1] as Vec3;
    const along = new Vector3(x0, 0, z0).dot(axis);
    expect(along).toBeCloseTo(2 * (r + t));
  });

  it("仕切りは鉛直な面で、中心から外側の頂点(2(r+t))まで、底が y=0", () => {
    const d = new Vector3(-Math.sqrt(3) / 2, 0, 0.5);
    const lateral = new Vector3(0.5, 0, Math.sqrt(3) / 2);
    const [offX, offY, offZ] = ZONE_PARTITION.offset;
    expect(offY).toBe(0);
    expect(Math.hypot(offX, offZ)).toBeCloseTo(pt);
    expect(new Vector3(offX, 0, offZ).dot(lateral)).toBeCloseTo(pt);
    const ss: number[] = [];
    for (const [x, y, z] of ZONE_PARTITION.polygon) {
      const p = new Vector3(x, 0, z);
      expect(p.dot(lateral)).toBeCloseTo(-pt / 2);
      const s = p.dot(d);
      ss.push(s);
      if (y !== 0) {
        const centerZ = s * d.z;
        expect(y).toBeCloseTo(ridgeHeight(s));
        expect(y).toBeCloseTo(
          APEX_HEIGHT - ((APEX_HEIGHT - WALL_HEIGHT) / r) * centerZ,
        );
      }
    }
    expect(Math.min(...ss)).toBeCloseTo(0);
    expect(Math.max(...ss)).toBeCloseTo(2 * (r + t));
    const ys = ZONE_PARTITION.polygon.map(([, y]) => y);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(APEX_HEIGHT);
    expect(ridgeHeight(0)).toBe(APEX_HEIGHT);
    expect(ridgeHeight(SANDBOX_CIRCUMRADIUS)).toBeCloseTo(WALL_HEIGHT);
  });

  it("屋根は頂点 (0, APEX, 0) と外壁の室内上端 (z=r, y=WALL_HEIGHT) を通る平面上の三角形で、外向きに厚さ t", () => {
    const planeY = (z: number) =>
      APEX_HEIGHT - ((APEX_HEIGHT - WALL_HEIGHT) / r) * z;
    expect(planeY(r)).toBeCloseTo(WALL_HEIGHT);
    const [apex, b, c] = ZONE_ROOF.polygon as [Vec3, Vec3, Vec3];
    expect(apex).toEqual([0, APEX_HEIGHT, 0]);
    for (const [, y, z] of ZONE_ROOF.polygon) {
      expect(y).toBeCloseTo(planeY(z));
    }
    expect(b[2]).toBeCloseTo(r + t);
    expect(c[2]).toBeCloseTo(r + t);
    expect(b[0]).toBeCloseTo(-Math.sqrt(3) * (r + t));
    expect(c[0]).toBeCloseTo(Math.sqrt(3) * (r + t));
    const offset = new Vector3(...ZONE_ROOF.offset);
    expect(offset.length()).toBeCloseTo(t);
    expect(offset.y).toBeGreaterThan(0);
    expect(offset.dot(new Vector3(1, 0, 0))).toBeCloseTo(0);
    expect(offset.dot(new Vector3(0, planeY(1) - planeY(0), 1))).toBeCloseTo(0);
  });

  it("屋根の三角形の左右の辺は、仕切りの中心線の真上(稜線)に載る", () => {
    const [, , c] = ZONE_ROOF.polygon as [Vec3, Vec3, Vec3];
    const dir = new Vector3(Math.sqrt(3) / 2, 0, 0.5);
    const along = new Vector3(c[0], 0, c[2]);
    expect(along.dot(dir)).toBeCloseTo(2 * (r + t));
    expect(
      along
        .clone()
        .sub(dir.clone().multiplyScalar(2 * (r + t)))
        .length(),
    ).toBeCloseTo(0);
    expect(c[1]).toBeCloseTo(ridgeHeight(2 * (r + t)));
  });
});

describe.each(ZONES)("区画 %i のオブジェクトの置き場所", (zone) => {
  const place = (local: Placement) => worldPlacement(zone, local);
  const zoneFootprint = (local: Placement, range: [XZ, XZ]): XZ[] =>
    footprint(place(local), ...range).map((p) => toZoneLocal(zone, p));

  const desk = zoneFootprint(ZONE_WORKSPACE, DESK_RANGE);
  const chair = zoneFootprint(ZONE_CHAIR, CHAIR_RANGE);
  const canvas = zoneFootprint(ZONE_CANVAS, CANVAS_RANGE);

  it.each([
    ["机", desk],
    ["イス", chair],
    ["キャンバス", canvas],
  ] as const)(
    "%s の足跡は区画の三角形の中で、仕切りと山から離れている",
    (_, corners) => {
      for (const p of corners) {
        for (const d of partitionDistances(p)) {
          expect(d).toBeGreaterThanOrEqual(pt / 2 + CLEAR);
        }
        expect(Math.hypot(p[0], p[1])).toBeGreaterThanOrEqual(
          MOUNTAIN_REACH + CLEAR,
        );
        expect(p[1]).toBeLessThanOrEqual(r + 1e-9);
      }
    },
  );

  it("イス・キャンバスは外壁の室内側の面からも離れ、机は外壁に付く(隙間 0.15m 以下)", () => {
    for (const p of [...chair, ...canvas]) {
      expect(p[1]).toBeLessThanOrEqual(r - CLEAR);
    }
    const deskBack = Math.max(...desk.map((p) => p[1]));
    expect(deskBack).toBeLessThanOrEqual(r);
    expect(r - deskBack).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it("机・イス・キャンバスは互いに重ならない", () => {
    expect(overlaps(desk, chair)).toBe(false);
    expect(overlaps(desk, canvas)).toBe(false);
    expect(overlaps(chair, canvas)).toBe(false);
  });

  it("机の手前(中心側)にイスが座り、机に重ならず、人が引いて座れる間(0.6m 未満)がある", () => {
    const deskFront = Math.min(...desk.map((p) => p[1]));
    const chairFront = Math.max(...chair.map((p) => p[1]));
    expect(chairFront).toBeLessThan(deskFront);
    expect(deskFront - chairFront).toBeLessThan(0.6);
    expect(ZONE_CHAIR.position[0]).toBe(ZONE_WORKSPACE.position[0]);
  });

  it("イスは外壁の方(机の方)を、机の手前は中心の方を向く", () => {
    const facing = (yaw: number) => [-Math.sin(yaw), -Math.cos(yaw)];
    const chairLocalYaw = place(ZONE_CHAIR).yaw - zoneYaw(zone);
    expect(facing(chairLocalYaw)[0]).toBeCloseTo(0);
    expect(facing(chairLocalYaw)[1]).toBeCloseTo(1);
    const deskLocalYaw = place(ZONE_WORKSPACE).yaw - zoneYaw(zone);
    expect(Math.sin(deskLocalYaw)).toBeCloseTo(0);
    expect(Math.cos(deskLocalYaw)).toBeCloseTo(-1);
  });

  it("PC は机の天板の上(机の真上、奥側)にある", () => {
    const pc = new Vector3(...place(ZONE_PC).position);
    const deskPos = new Vector3(...place(ZONE_WORKSPACE).position);
    const local = pc
      .clone()
      .sub(deskPos)
      .applyAxisAngle(Y_AXIS, -place(ZONE_WORKSPACE).yaw);
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(0.95);
    expect(local.z).toBeCloseTo(-0.3);
    expect(Math.abs(local.z)).toBeLessThan(TOP_SIZE[2] / 2);
    expect(toZoneLocal(zone, [pc.x, pc.z])[1]).toBeGreaterThan(
      toZoneLocal(zone, [deskPos.x, deskPos.z])[1],
    );
  });

  it("スポーン地点は区画の三角形の中で、山・仕切り・外壁から離れ、中心(ディレクトリ)の方を向く", () => {
    const spawn = sandboxSpawnOf(zone + 1);
    expect(spawn.position[1]).toBeCloseTo(0.05);
    const local = toZoneLocal(zone, [spawn.position[0], spawn.position[2]]);
    for (const d of partitionDistances(local)) {
      expect(d).toBeGreaterThanOrEqual(pt / 2 + CAPSULE_RADIUS);
    }
    expect(local[1]).toBeLessThanOrEqual(r - CAPSULE_RADIUS);
    expect(Math.hypot(local[0], local[1])).toBeGreaterThanOrEqual(
      MOUNTAIN_REACH + CAPSULE_RADIUS,
    );
    const facing = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
    const toCenter = [-spawn.position[0], -spawn.position[2]];
    const len = Math.hypot(toCenter[0] as number, toCenter[1] as number);
    expect(facing[0]).toBeCloseTo((toCenter[0] as number) / len);
    expect(facing[1]).toBeCloseTo((toCenter[1] as number) / len);
  });

  it("キャンバスの絵の面(既定は +Z)は、スポーン地点を向く", () => {
    const canvasPlacement = place(ZONE_CANVAS);
    const spawn = sandboxSpawnOf(zone + 1);
    const facing = [
      Math.sin(canvasPlacement.yaw),
      Math.cos(canvasPlacement.yaw),
    ];
    const toSpawn = [
      spawn.position[0] - canvasPlacement.position[0],
      spawn.position[2] - canvasPlacement.position[2],
    ];
    const len = Math.hypot(toSpawn[0] as number, toSpawn[1] as number);
    expect(facing[0]).toBeCloseTo((toSpawn[0] as number) / len);
    expect(facing[1]).toBeCloseTo((toSpawn[1] as number) / len);
  });
});

describe("ディレクトリ・スポーン", () => {
  it("ディレクトリは中心(原点)の large の山", () => {
    expect(SANDBOX_LAYOUT.directory?.position).toEqual([0, 0, 0]);
    expect(SANDBOX_LAYOUT.directory?.look).toBe("large");
    expect(MOUNTAIN_REACH).toBeLessThan(r);
  });

  it("スポーン地点は区画ごとに 1 つで、区画ローカルの値を回したもの", () => {
    expect(SEATS).toHaveLength(ZONE_COUNT);
    expect(sandboxSpawnOf(1).position).toEqual(ZONE_SPAWN.position);
    expect(sandboxSpawnOf(1).yaw).toBe(ZONE_SPAWN.yaw);
    for (const zone of ZONES) {
      const spawn = sandboxSpawnOf(zone + 1);
      const expected = new Vector3(...ZONE_SPAWN.position).applyAxisAngle(
        Y_AXIS,
        zoneYaw(zone),
      );
      expect(spawn.position[0]).toBeCloseTo(expected.x);
      expect(spawn.position[1]).toBeCloseTo(expected.y);
      expect(spawn.position[2]).toBeCloseTo(expected.z);
      expect(spawn.yaw).toBeCloseTo(ZONE_SPAWN.yaw + zoneYaw(zone));
    }
  });
});
