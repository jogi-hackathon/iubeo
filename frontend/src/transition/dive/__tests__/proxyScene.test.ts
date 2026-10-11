import {type Group, type Mesh, type Object3D} from "three";
import {afterEach, beforeAll, describe, expect, it, vi} from "vitest";

import {CHAIR_PARTS} from "../../../props/chairParts";
import {
  CHAIR_POSITION,
  ROOM_FLOOR,
  ROOM_WALLS,
} from "../../../scenes/RoomScene/layout";
import {
  seatYaw,
  ZONE_CHAIR,
  ZONE_COUNT,
  ZONE_WALLS,
} from "../../../scenes/SandboxScene/layout";
import {createProxyScene, type ProxyScene} from "../proxyScene";

const meshes = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      out.push(o as Mesh);
    }
  });
  return out;
};

const groups = (root: Object3D): Group[] =>
  root.children.filter((c) => (c as Group).isGroup) as Group[];

beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: () => ({width: 0, height: 0, getContext: () => null}),
  });
});

let current: ProxyScene | null = null;
afterEach(() => {
  current?.dispose();
  current = null;
});

describe("createProxyScene", () => {
  it("room は床・壁・イスのメッシュ数と位置が layout と一致する", () => {
    current = createProxyScene("room");
    const {scene} = current;
    const direct = scene.children.filter((c) => (c as Mesh).isMesh) as Mesh[];
    expect(direct).toHaveLength(1 + ROOM_WALLS.length);
    expect(direct[0]?.position.toArray()).toEqual(ROOM_FLOOR.position);
    ROOM_WALLS.forEach((wall, i) => {
      expect(direct[i + 1]?.position.toArray()).toEqual(wall.position);
    });
    const [chair] = groups(scene);
    expect(chair?.position.toArray()).toEqual(CHAIR_POSITION);
    expect(chair?.children).toHaveLength(CHAIR_PARTS.length);
    expect(meshes(scene)).toHaveLength(
      1 + ROOM_WALLS.length + CHAIR_PARTS.length,
    );
  });

  it("sandbox は 3 区画分、座席の向きで回した建物を持つ", () => {
    current = createProxyScene("sandbox");
    const zones = groups(current.scene);
    expect(zones).toHaveLength(ZONE_COUNT);
    zones.forEach((zone, i) => {
      expect(zone.rotation.y).toBeCloseTo(seatYaw(i + 1));
      const slabs = zone.children.filter(
        (c) =>
          (c as Mesh).isMesh && (c as Mesh).geometry.type !== "BoxGeometry",
      );
      expect(slabs).toHaveLength(3);
      const boxes = zone.children.filter(
        (c) =>
          (c as Mesh).isMesh && (c as Mesh).geometry.type === "BoxGeometry",
      );
      expect(boxes).toHaveLength(ZONE_WALLS.length);
      boxes.forEach((box, j) => {
        expect(box.position.toArray()).toEqual(ZONE_WALLS[j]?.position);
      });
      const chair = zone.children.find((c) => (c as Group).isGroup);
      expect(chair?.position.toArray()).toEqual(ZONE_CHAIR.position);
      expect(chair?.rotation.y).toBeCloseTo(ZONE_CHAIR.yaw);
    });
  });

  it("環境(フォグ・背景・ライト)を持つ", () => {
    current = createProxyScene("room");
    expect(current.scene.fog).not.toBeNull();
    expect(current.scene.backgroundNode).not.toBeNull();
    const types = current.scene.children.map((c) => c.type);
    expect(types).toContain("HemisphereLight");
    expect(types).toContain("DirectionalLight");
  });

  it("dispose で背景を外し、子を空にする", () => {
    const proxy = createProxyScene("sandbox");
    proxy.dispose();
    expect(proxy.scene.children).toHaveLength(0);
    expect(proxy.scene.backgroundNode).toBeNull();
  });
});
