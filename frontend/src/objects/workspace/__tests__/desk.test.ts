import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Raycaster,
  Vector3,
} from "three";
import {describe, expect, it} from "vitest";

import {EYE_HEIGHT, PLAYER_HEIGHT} from "../../../player/constants";
import {INTERACT_DISTANCE} from "../../interaction/aim";
import {
  DESK_HEIGHT,
  DESK_PARTS,
  type DeskPart,
  ON_TOP,
  TOP_SIZE,
  WORK_AREA_SIZE,
} from "../desk";

const EPS = 1e-6;

const buildDesk = () => {
  const group = new Group();
  const meshes = DESK_PARTS.map((part) => {
    const mesh = new Mesh(
      part.shape === "box"
        ? new BoxGeometry(1, 1, 1)
        : new CylinderGeometry(1, 1, 1, 10),
    );
    mesh.position.set(...part.position);
    mesh.scale.set(...part.scale);
    if (part.rotation) {
      mesh.rotation.set(...part.rotation);
    }
    mesh.userData.part = part;
    group.add(mesh);
    return mesh;
  });
  group.updateMatrixWorld(true);
  return {group, meshes};
};

const bounds = (mesh: Mesh) => new Box3().setFromObject(mesh);

describe("desk", () => {
  it("天板は腰(身長の半分)より高く、目より低い", () => {
    expect(DESK_HEIGHT).toBeGreaterThan(PLAYER_HEIGHT / 2);
    expect(DESK_HEIGHT).toBeLessThan(EYE_HEIGHT);
  });

  it("部品はみな天板のフットプリントの中、床より上に収まる", () => {
    const {meshes} = buildDesk();
    for (const mesh of meshes) {
      const b = bounds(mesh);
      expect(b.min.x).toBeGreaterThanOrEqual(-TOP_SIZE[0] / 2 - EPS);
      expect(b.max.x).toBeLessThanOrEqual(TOP_SIZE[0] / 2 + EPS);
      expect(b.min.z).toBeGreaterThanOrEqual(-TOP_SIZE[2] / 2 - EPS);
      expect(b.max.z).toBeLessThanOrEqual(TOP_SIZE[2] / 2 + EPS);
      expect(b.min.y).toBeGreaterThanOrEqual(-EPS);
    }
  });

  it("天板の上の小物は天板に載っていて、中央の作業スペース(A4 が入る)にはかからない", () => {
    const {meshes} = buildDesk();
    const [halfX, halfZ] = [WORK_AREA_SIZE[0] / 2, WORK_AREA_SIZE[1] / 2];
    expect(WORK_AREA_SIZE[0]).toBeGreaterThanOrEqual(0.297);
    expect(WORK_AREA_SIZE[1]).toBeGreaterThanOrEqual(0.21);
    const onTop = meshes.filter((m) =>
      ON_TOP.includes(m.userData.part as DeskPart),
    );
    expect(onTop.length).toBe(ON_TOP.length);
    for (const mesh of onTop) {
      const b = bounds(mesh);
      expect(b.min.y).toBeGreaterThanOrEqual(DESK_HEIGHT - EPS);
      const outside =
        b.max.x <= -halfX ||
        b.min.x >= halfX ||
        b.max.z <= -halfZ ||
        b.min.z >= halfZ;
      expect(outside).toBe(true);
    }
  });

  it("前に立って天板の中央を見下ろすと、視線はまず天板に当たり、届く距離にある", () => {
    const {group} = buildDesk();
    const standOff = 0.6;
    const eye = new Vector3(0, EYE_HEIGHT, TOP_SIZE[2] / 2 + standOff);
    const target = new Vector3(0, DESK_HEIGHT, 0);
    const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
    const [first] = ray.intersectObject(group, true);
    expect(first).toBeDefined();
    expect((first!.object.userData.part as DeskPart).look).toBe("top");
    expect(first!.distance).toBeLessThan(INTERACT_DISTANCE);
    expect(first!.point.distanceTo(target)).toBeLessThan(EPS);
  });
});
