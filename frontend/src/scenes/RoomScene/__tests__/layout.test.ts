import {Box3, BoxGeometry, Mesh, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {MOUNTAIN_REACH} from "../../../objects/directory/mountain";
import {OVERVIEW_HEIGHT} from "../../../objects/directory/overviewPose";
import {START_POSITION} from "../../../player/constants";
import {CHAIR_PARTS} from "../../../props/chairParts";
import {
  CANVAS_POSITION,
  CHAIR_POSITION,
  DIRECTORY_POSITION,
  PC_POSITION,
  ROOM_INNER_X,
  ROOM_INNER_Z_NORTH,
  ROOM_FLOOR,
  ROOM_INNER_Z_SOUTH,
  ROOM_SIZE,
  ROOM_WALLS,
  WINDOW_CENTER_Z,
  WINDOW_PLUG,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
  WORKSPACE_POSITION,
} from "../layout";

const wallBox = (wall: (typeof ROOM_WALLS)[number]) =>
  new Box3().setFromCenterAndSize(
    new Vector3(...wall.position),
    new Vector3(...wall.size),
  );

/** 点が、どれかの壁の中にあるか */
const insideWall = (x: number, y: number, z: number) =>
  ROOM_WALLS.some((w) => wallBox(w).containsPoint(new Vector3(x, y, z)));

describe("room layout", () => {
  it("室内は一辺 ROOM_SIZE の立方体で、俯瞰カメラが天井の内側に収まる", () => {
    expect(ROOM_INNER_X * 2).toBe(ROOM_SIZE);
    expect(ROOM_INNER_Z_SOUTH - ROOM_INNER_Z_NORTH).toBe(ROOM_SIZE);
    expect(OVERVIEW_HEIGHT).toBeLessThan(ROOM_SIZE);
  });

  it("床は上面が y=0 で、室内全体と壁の下を覆う", () => {
    const b = wallBox(ROOM_FLOOR);
    expect(b.max.y).toBe(0);
    expect(b.min.x).toBeLessThanOrEqual(-ROOM_INNER_X);
    expect(b.max.x).toBeGreaterThanOrEqual(ROOM_INNER_X);
    expect(b.min.z).toBeLessThanOrEqual(ROOM_INNER_Z_NORTH);
    expect(b.max.z).toBeGreaterThanOrEqual(ROOM_INNER_Z_SOUTH);
  });

  it("壁は室内に食い込まない(室内側の面が、室内の立方体の外)", () => {
    for (const wall of ROOM_WALLS) {
      const b = wallBox(wall);
      const overlapsRoom =
        b.max.x > -ROOM_INNER_X + 1e-9 &&
        b.min.x < ROOM_INNER_X - 1e-9 &&
        b.max.z > ROOM_INNER_Z_NORTH + 1e-9 &&
        b.min.z < ROOM_INNER_Z_SOUTH - 1e-9 &&
        b.min.y < ROOM_SIZE - 1e-9;
      expect(overlapsRoom).toBe(false);
    }
  });

  it("室内は壁と天井で隙間なく閉じている(窓の空洞を除く)", () => {
    const step = 0.25;
    for (let y = step / 2; y < ROOM_SIZE; y += step) {
      for (let t = -ROOM_SIZE / 2; t < ROOM_SIZE / 2; t += step) {
        const u = t + step / 2;
        const z = ROOM_INNER_Z_NORTH + ROOM_SIZE / 2 + u;
        const e = 0.1;
        // 奥・手前・右の壁は、室内側の面のすぐ外が壁
        expect(insideWall(u, y, ROOM_INNER_Z_NORTH - e)).toBe(true);
        expect(insideWall(u, y, ROOM_INNER_Z_SOUTH + e)).toBe(true);
        expect(insideWall(ROOM_INNER_X + e, y, z)).toBe(true);
        // 天井
        expect(insideWall(u, ROOM_SIZE + e, z)).toBe(true);
      }
    }
  });

  it("左の壁には、一辺 WINDOW_SIZE の正方形の空洞だけがある", () => {
    const step = 0.25;
    const windowZ0 = WINDOW_CENTER_Z - WINDOW_SIZE / 2;
    for (let y = step / 2; y < ROOM_SIZE; y += step) {
      for (
        let z = ROOM_INNER_Z_NORTH + step / 2;
        z < ROOM_INNER_Z_SOUTH;
        z += step
      ) {
        const inWindow =
          y > WINDOW_SILL_HEIGHT &&
          y < WINDOW_SILL_HEIGHT + WINDOW_SIZE &&
          z > windowZ0 &&
          z < windowZ0 + WINDOW_SIZE;
        expect(insideWall(-ROOM_INNER_X - 0.1, y, z)).toBe(!inWindow);
      }
    }
  });

  it("窓をふさぐ壁板は、窓の空洞とちょうど同じ大きさ", () => {
    const plug = wallBox(WINDOW_PLUG);
    const windowZ0 = WINDOW_CENTER_Z - WINDOW_SIZE / 2;
    expect(plug.min.y).toBeCloseTo(WINDOW_SILL_HEIGHT);
    expect(plug.max.y).toBeCloseTo(WINDOW_SILL_HEIGHT + WINDOW_SIZE);
    expect(plug.min.z).toBeCloseTo(windowZ0);
    expect(plug.max.z).toBeCloseTo(windowZ0 + WINDOW_SIZE);
    expect(plug.max.x).toBeCloseTo(-ROOM_INNER_X);
    // 周りの壁と重ならない(内側の点はどの壁にも入らない)
    const c = plug.getCenter(new Vector3());
    expect(insideWall(c.x, c.y, c.z)).toBe(false);
  });

  it("窓の下端は目の高さより低く、上端は目の高さより高い(立って外が見える)", () => {
    expect(WINDOW_SILL_HEIGHT).toBeLessThan(1.6);
    expect(WINDOW_SILL_HEIGHT + WINDOW_SIZE).toBeGreaterThan(1.6);
  });

  it("オブジェクトはみな室内の床の上にあり、スポーン地点も室内", () => {
    for (const [x, , z] of [
      DIRECTORY_POSITION,
      WORKSPACE_POSITION,
      CANVAS_POSITION,
      CHAIR_POSITION,
      PC_POSITION,
      [START_POSITION[0], 0, START_POSITION[2]],
    ] as const) {
      expect(Math.abs(x)).toBeLessThanOrEqual(ROOM_INNER_X);
      expect(z).toBeGreaterThanOrEqual(ROOM_INNER_Z_NORTH);
      expect(z).toBeLessThanOrEqual(ROOM_INNER_Z_SOUTH);
    }
  });

  it("キャンバスの足元(x ±0.49・z -0.62〜0.32)は、壁・山・机にめり込まない", () => {
    const [cx, , cz] = CANVAS_POSITION;
    expect(cx + 0.49).toBeLessThan(ROOM_INNER_X);
    expect(cz - 0.62).toBeGreaterThan(ROOM_INNER_Z_NORTH);
    // 山の中心からキャンバスの一番近い足元までの距離が、束の端までの半径より外
    const nearest = Math.hypot(
      cx - 0.49 - DIRECTORY_POSITION[0],
      cz + 0.32 - DIRECTORY_POSITION[2],
    );
    expect(nearest).toBeGreaterThan(MOUNTAIN_REACH - 0.5);
  });

  it("机(1.6m x 0.8m)と山(束の端まで MOUNTAIN_REACH)の間は 1m 以上空く", () => {
    const deskBackZ = WORKSPACE_POSITION[2] - 0.4;
    const mountainFrontZ = DIRECTORY_POSITION[2] + MOUNTAIN_REACH;
    expect(deskBackZ - mountainFrontZ).toBeGreaterThanOrEqual(1);
  });

  it("イスは机の手前に座り、机に重ならず、人が引いて座れる間がある", () => {
    const deskFrontZ = WORKSPACE_POSITION[2] + 0.4;
    const chairFrontZ = CHAIR_POSITION[2] - 0.225;
    expect(chairFrontZ).toBeGreaterThan(deskFrontZ);
    expect(chairFrontZ - deskFrontZ).toBeLessThan(0.6);
    expect(CHAIR_POSITION[0]).toBe(WORKSPACE_POSITION[0]);
  });

  it("PC は机の天板の上(机の真上、奥側)にある", () => {
    expect(PC_POSITION[0]).toBeGreaterThan(WORKSPACE_POSITION[0] - 0.8);
    expect(PC_POSITION[0]).toBeLessThan(WORKSPACE_POSITION[0] + 0.8);
    expect(PC_POSITION[2]).toBeLessThan(WORKSPACE_POSITION[2]);
    expect(PC_POSITION[2]).toBeGreaterThan(WORKSPACE_POSITION[2] - 0.4);
  });

  it("イスの部品は床より上に収まる", () => {
    for (const part of CHAIR_PARTS) {
      const mesh = new Mesh(new BoxGeometry(...part.size));
      mesh.position.set(...part.position);
      mesh.updateMatrixWorld(true);
      const b = new Box3().setFromObject(mesh);
      expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});
