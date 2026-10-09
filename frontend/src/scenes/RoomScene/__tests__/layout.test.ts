import {Box3, BoxGeometry, Mesh, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {mountainReach} from "../../../objects/directory/mountain";
import {
  KEYBOARD,
  MEMO,
  MONITOR_BODY_DEPTH,
  MONITOR_Z,
  MOUSE,
  TOWER,
} from "../../../objects/pc/dimensions";
import {CHAIR_PARTS} from "../../../props/chairParts";
import {
  CANVAS_POSITION,
  CANVAS_YAW,
  CHAIR_POSITION,
  DIRECTORY_POSITION,
  PC_POSITION,
  ROOM_INNER_X,
  ROOM_INNER_Z_NORTH,
  ROOM_FLOOR,
  ROOM_INNER_Z_SOUTH,
  ROOM_SIZE,
  ROOM_SPAWN_POSITION,
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
  it("室内は一辺 ROOM_SIZE の立方体", () => {
    expect(ROOM_INNER_X * 2).toBe(ROOM_SIZE);
    expect(ROOM_INNER_Z_SOUTH - ROOM_INNER_Z_NORTH).toBe(ROOM_SIZE);
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
      WORKSPACE_POSITION,
      CANVAS_POSITION,
      CHAIR_POSITION,
      PC_POSITION,
      ROOM_SPAWN_POSITION,
    ] as const) {
      expect(Math.abs(x)).toBeLessThanOrEqual(ROOM_INNER_X);
      expect(z).toBeGreaterThanOrEqual(ROOM_INNER_Z_NORTH);
      expect(z).toBeLessThanOrEqual(ROOM_INNER_Z_SOUTH);
    }
  });

  it("ディレクトリは、奥の壁の向こうに中心を置き、室内への張り出しは 2m 未満", () => {
    const [x, , z] = DIRECTORY_POSITION;
    expect(x).toBe(0);
    expect(z).toBeLessThanOrEqual(ROOM_INNER_Z_NORTH);
    // 山の端(束の端まで)と、奥の壁の室内側の面の間
    expect(z + mountainReach("small") - ROOM_INNER_Z_NORTH).toBeLessThan(2);
  });

  it("キャンバスの足元(x ±0.49・z -0.62〜0.32 を CANVAS_YAW で回したもの)は、壁にめり込まず、山の端より外", () => {
    const [cx, , cz] = CANVAS_POSITION;
    const cos = Math.cos(CANVAS_YAW);
    const sin = Math.sin(CANVAS_YAW);
    // rotation.y で回した足元の四隅(ワールド座標)
    const corners = [
      [-0.49, -0.62],
      [0.49, -0.62],
      [-0.49, 0.32],
      [0.49, 0.32],
    ].map(([x, z]) => [
      cx + (x as number) * cos + (z as number) * sin,
      cz - (x as number) * sin + (z as number) * cos,
    ]);
    for (const [x, z] of corners as [number, number][]) {
      expect(Math.abs(x)).toBeLessThan(ROOM_INNER_X);
      expect(z).toBeGreaterThan(ROOM_INNER_Z_NORTH);
      expect(
        Math.hypot(x - DIRECTORY_POSITION[0], z - DIRECTORY_POSITION[2]),
      ).toBeGreaterThan(mountainReach("small"));
    }
  });

  it("キャンバスの絵の面(既定は +Z)は、スポーン地点を向く", () => {
    const facing = [Math.sin(CANVAS_YAW), Math.cos(CANVAS_YAW)];
    const toSpawn = [
      ROOM_SPAWN_POSITION[0] - CANVAS_POSITION[0],
      ROOM_SPAWN_POSITION[2] - CANVAS_POSITION[2],
    ];
    const len = Math.hypot(toSpawn[0] as number, toSpawn[1] as number);
    expect(facing[0]).toBeCloseTo((toSpawn[0] as number) / len);
    expect(facing[1]).toBeCloseTo((toSpawn[1] as number) / len);
  });

  it("机(1.6m x 0.8m)の奥の縁と山の端(束の端まで mountainReach(small))の間は 0.5m 以上空く", () => {
    const deskBackZ = WORKSPACE_POSITION[2] - 0.4;
    const mountainFrontZ = DIRECTORY_POSITION[2] + mountainReach("small");
    expect(deskBackZ - mountainFrontZ).toBeGreaterThanOrEqual(0.5);
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

  it("PC の、机に載る部品はすべて天板(奥行き 0.8m)の内側に収まる", () => {
    // PC の原点からの、各部品の z の張り出し(後ろ, 手前)。CRT の管の後端は
    // 高い所にあるので対象外。台座の後端(-0.26)はモニタ群の中の一番後ろで机に触れる点
    const offsetZ = PC_POSITION[2] - WORKSPACE_POSITION[2];
    const parts: [string, number, number][] = [
      ["モニタ本体", MONITOR_Z - MONITOR_BODY_DEPTH / 2, MONITOR_Z + 0.2],
      ["モニタ台座", MONITOR_Z - 0.14, MONITOR_Z + 0.12],
      ["タワー", TOWER.z - TOWER.depth / 2, TOWER.z + TOWER.depth / 2],
      [
        "キーボード",
        KEYBOARD.z - KEYBOARD.depth / 2,
        KEYBOARD.z + KEYBOARD.depth / 2,
      ],
      ["マウス", MOUSE.z - MOUSE.depth / 2, MOUSE.z + MOUSE.depth / 2],
      // メモは傾けて立てる板。傾きの分だけ厚み側に広がるので、高さの半分を余分に見る
      ["メモ", MEMO.z - MEMO.height / 2, MEMO.z + MEMO.height / 2],
    ];
    for (const [name, back, front] of parts) {
      expect(back + offsetZ, name).toBeGreaterThanOrEqual(-0.4);
      expect(front + offsetZ, name).toBeLessThanOrEqual(0.4);
    }
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
