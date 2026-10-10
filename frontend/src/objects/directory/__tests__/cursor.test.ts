import {Quaternion, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {CENTER_CURSOR, cursorRay, moveCursor} from "../cursor";
import {createFileAssigner, pickFile, plateOf} from "../fileAssign";
import {buildMountain, MOUNTAIN_HEIGHT_MAX, MOUNTAIN_REACH} from "../mountain";
import {
  CAMERA_FOV,
  computeOverviewPose,
  overviewQuaternion,
} from "../overviewPose";

const FOV = CAMERA_FOV;
const ASPECTS = [16 / 9, 4 / 3];
const VIEWPORT = {width: 1600, height: 900};

describe("moveCursor", () => {
  it("中央から始まる", () => {
    expect(CENTER_CURSOR).toEqual({x: 0, y: 0});
  });

  it("移動量は画面のピクセル数で NDC に直す(右で右、下で下)", () => {
    const c = moveCursor({x: 0, y: 0}, 400, 90, VIEWPORT);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(-0.2);
  });

  it("左・上へは逆向きに動く", () => {
    const c = moveCursor({x: 0, y: 0}, -160, -45, VIEWPORT);
    expect(c.x).toBeCloseTo(-0.2);
    expect(c.y).toBeCloseTo(0.1);
  });

  it("画面の外には出ない", () => {
    const c = moveCursor({x: 0.9, y: -0.9}, 1e6, 1e6, VIEWPORT);
    expect(c).toEqual({x: 1, y: -1});
    moveCursor(c, -1e6, -1e6, VIEWPORT);
    expect(c).toEqual({x: -1, y: 1});
  });
});

describe("cursorRay", () => {
  const pose = computeOverviewPose([0, 0, 0], 0.4);
  const origin = new Vector3(...pose.position);
  const q = overviewQuaternion(pose, new Quaternion());

  it("中央のカーソルは、カメラの真正面(真下)を通る", () => {
    const {direction} = cursorRay(CENTER_CURSOR, origin, q, FOV, 16 / 9);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(-1);
    expect(direction.z).toBeCloseTo(0);
  });

  it("画面の右端・上端は、画角ぶん傾く", () => {
    const right = cursorRay({x: 1, y: 0}, origin, q, FOV, 16 / 9).direction;
    const top = cursorRay({x: 0, y: 1}, origin, q, FOV, 16 / 9).direction;
    const angle = (d: Vector3) => Math.acos(-d.y);
    expect(angle(top)).toBeCloseTo((FOV / 2) * (Math.PI / 180));
    expect(angle(right)).toBeCloseTo(
      Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * (16 / 9)),
    );
  });

  it("カーソルを右へ動かすと、視線は画面の右方向(上方向はプレイヤーの向き)へ動く", () => {
    const yaw = 0.4;
    const {direction} = cursorRay({x: 0.5, y: 0}, origin, q, FOV, 16 / 9);
    expect(
      direction.x * Math.cos(yaw) + direction.z * -Math.sin(yaw),
    ).toBeGreaterThan(0);
  });
});

const project = (
  x: number,
  y: number,
  z: number,
  aspect: number,
  pose: ReturnType<typeof computeOverviewPose>,
) => {
  const q = overviewQuaternion(pose, new Quaternion());
  const local = new Vector3(x, y, z)
    .sub(new Vector3(...pose.position))
    .applyQuaternion(q.clone().invert());
  const half = Math.tan((FOV / 2) * (Math.PI / 180));
  return {
    x: local.x / -local.z / (half * aspect),
    y: local.y / -local.z / half,
  };
};

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

describe("山全体の画面内への収まり", () => {
  const mountain = buildMountain("directory-1");

  it("カメラは山頂より 1.5m 以上高い", () => {
    const pose = computeOverviewPose([0, 0, 0], 0);
    expect(pose.position[1]).toBeGreaterThanOrEqual(MOUNTAIN_HEIGHT_MAX + 1.5);
  });

  it("山の裾(束の端まで)と、在庫ファイルの候補の全部が、16:9 でも 4:3 でも画面内に収まる", () => {
    for (const aspect of ASPECTS) {
      for (const yaw of [0, 1, Math.PI, -2.4]) {
        const pose = computeOverviewPose([0, 0, 0], yaw);
        for (let i = 0; i < 360; i++) {
          const a = (i / 360) * Math.PI * 2;
          const p = project(
            Math.cos(a) * MOUNTAIN_REACH,
            0,
            Math.sin(a) * MOUNTAIN_REACH,
            aspect,
            pose,
          );
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
        }
        for (const c of mountain.candidates) {
          const p = project(c.x, c.topY, c.z, aspect, pose);
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
        }
      }
    }
  });
});

describe("カーソルでの狙い", () => {
  it("割り当てた各束の上面の中心にカーソルを置くと、pickFile がそのファイルを返す(両アスペクト)", () => {
    const base: [number, number, number] = [0, 0, 0];
    const mountain = buildMountain("directory-1");
    for (const aspect of ASPECTS) {
      const pose = computeOverviewPose(base, 1.1);
      const q = overviewQuaternion(pose, new Quaternion());
      const origin = new Vector3(...pose.position);
      const assigner = createFileAssigner(
        mountain.candidates.length,
        seeded(7),
      );
      const ids = Array.from({length: 6}, (_, i) => `f${i}`);
      assigner.sync(ids);
      const plates = ids.map((id) =>
        plateOf(
          id,
          mountain.candidates[assigner.get(id) as number] as never,
          base,
        ),
      );
      for (const plate of plates) {
        const cursor = project(plate.x, plate.y, plate.z, aspect, pose);
        const ray = cursorRay(cursor, origin, q, FOV, aspect);
        expect(pickFile(ray.origin, ray.direction, plates)).toBe(plate.id);
      }
    }
  });

  it("画面の端まで動かしたカーソルは、山から離れた所を指し、何も選ばない", () => {
    const pose = computeOverviewPose([0, 0, 0], 0);
    const q = overviewQuaternion(pose, new Quaternion());
    const ray = cursorRay(
      {x: 1, y: 1},
      new Vector3(...pose.position),
      q,
      FOV,
      16 / 9,
    );
    const c = buildMountain("directory-1").candidates[0];
    expect(
      pickFile(ray.origin, ray.direction, [
        plateOf("f1", c as never, [0, 0, 0]),
      ]),
    ).toBeNull();
  });
});
