import {Box3, BoxGeometry, Group, Mesh, Raycaster, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {EYE_HEIGHT} from "../../../player/constants";
import {INTERACT_DISTANCE} from "../../interaction/aim";
import {
  CANVAS_CENTER_HEIGHT,
  CANVAS_SIZE,
  CLAMP_PART,
  EASEL_PARTS,
  type EaselPart,
  PAPER_PLACEMENT,
  type PaperPlacement,
  PAPER_SIZE,
  REAR_LEG_PART,
  TOP_BAR_PART,
} from "../easel";

const PAPER = "paper";

const buildEasel = () => {
  const group = new Group();
  const entries: [EaselPart | typeof PAPER, PaperPlacement][] = [
    ...EASEL_PARTS.map((part): [EaselPart, PaperPlacement] => [part, part]),
    [PAPER, PAPER_PLACEMENT],
  ];
  const meshes = entries.map(([part, placement]) => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));
    mesh.position.set(...placement.position);
    mesh.scale.set(...placement.scale);
    if (placement.rotation) {
      mesh.rotation.set(...placement.rotation);
    }
    mesh.userData.part = part;
    group.add(mesh);
    return mesh;
  });
  group.updateMatrixWorld(true);
  return {group, meshes};
};

const bounds = (mesh: Mesh) => new Box3().setFromObject(mesh);

describe("easel", () => {
  it("部品はみな足元の周り(幅 1m・奥行き 1.1m)に収まり、床にめり込まない(傾けた脚の沈む角は 2cm 未満)", () => {
    const {meshes} = buildEasel();
    for (const mesh of meshes) {
      const b = bounds(mesh);
      expect(b.min.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.max.x).toBeLessThanOrEqual(0.5);
      expect(b.min.z).toBeGreaterThanOrEqual(-0.7);
      expect(b.max.z).toBeLessThanOrEqual(0.5);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.02);
    }
  });

  it("脚は足を床に着け、全体は見上げるほど高くない(2m 以内)", () => {
    const {meshes} = buildEasel();
    const touching = meshes.filter((m) => bounds(m).min.y < 0.01);
    expect(touching.length).toBe(3);
    const top = Math.max(...meshes.map((m) => bounds(m).max.y));
    expect(top).toBeLessThanOrEqual(2);
    expect(top).toBeGreaterThan(CANVAS_CENTER_HEIGHT + CANVAS_SIZE[1] / 2);
  });

  it("キャンバスの中心は、目の高さより低く、見上げない高さにある", () => {
    expect(CANVAS_CENTER_HEIGHT).toBeLessThan(EYE_HEIGHT);
    expect(CANVAS_CENTER_HEIGHT - CANVAS_SIZE[1] / 2).toBeGreaterThan(0.5);
  });

  it("後脚の上端(角まで)は横木に差さり、横木は木枠の上に出ている(浮かない・隠れない)", () => {
    const {meshes} = buildEasel();
    const meshOf = (part: EaselPart) =>
      meshes.find((m) => m.userData.part === part)!;
    const bar = meshOf(TOP_BAR_PART);
    const rear = meshOf(REAR_LEG_PART);
    for (const x of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const corner = bar.worldToLocal(
          rear.localToWorld(new Vector3(x, 0.5, z)),
        );
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(corner.y)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(corner.z)).toBeLessThanOrEqual(0.5);
      }
    }

    const frame = meshes.find(
      (m) =>
        m.userData.part !== PAPER &&
        Math.abs(m.scale.x - CANVAS_SIZE[0]) < 1e-9 &&
        Math.abs(m.scale.y - CANVAS_SIZE[1]) < 1e-9,
    )!;
    const frameTopInBar = bar.worldToLocal(
      frame.localToWorld(new Vector3(0, 0.5, 0)),
    );
    expect(frameTopInBar.y).toBeLessThan(-0.5);
  });

  it("押さえの底面は木枠の天面に載り、奥行きは木枠の厚みをまたぐ", () => {
    const {meshes} = buildEasel();
    const clamp = meshes.find((m) => m.userData.part === CLAMP_PART)!;
    const frame = meshes.find(
      (m) =>
        m.userData.part !== PAPER &&
        Math.abs(m.scale.x - CANVAS_SIZE[0]) < 1e-9 &&
        Math.abs(m.scale.y - CANVAS_SIZE[1]) < 1e-9,
    )!;
    for (const z of [-0.5, 0.5]) {
      const p = clamp.worldToLocal(frame.localToWorld(new Vector3(0, 0.5, z)));
      expect(p.y).toBeCloseTo(-0.5, 6);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it("紙は木枠より一回り小さく、縦横比が PAPER_SIZE と合う", () => {
    expect(PAPER_SIZE[0]).toBeLessThan(CANVAS_SIZE[0]);
    expect(PAPER_SIZE[1]).toBeLessThan(CANVAS_SIZE[1]);
    expect(PAPER_PLACEMENT.scale[0]).toBe(PAPER_SIZE[0]);
    expect(PAPER_PLACEMENT.scale[1]).toBe(PAPER_SIZE[1]);
  });

  it("前に立ってキャンバスの中心を見ると、視線はまず紙に当たり、届く距離にある", () => {
    const {group} = buildEasel();
    const eye = new Vector3(0, EYE_HEIGHT, 1.2);
    const target = new Vector3(...PAPER_PLACEMENT.position);
    const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
    const [first] = ray.intersectObject(group, true);
    expect(first).toBeDefined();
    expect(first!.object.userData.part).toBe(PAPER);
    expect(first!.distance).toBeLessThan(INTERACT_DISTANCE);
  });

  it("後ろから見ると、紙の前に木枠(裏)が当たる", () => {
    const {group} = buildEasel();
    const target = new Vector3(...PAPER_PLACEMENT.position);
    const behind = new Vector3(0, target.y, -2);
    const ray = new Raycaster(behind, target.clone().sub(behind).normalize());
    const [first] = ray.intersectObject(group, true);
    expect(first).toBeDefined();
    expect(first!.object.userData.part).not.toBe(PAPER);
  });
});
