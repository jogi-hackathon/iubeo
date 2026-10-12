import {
  BoxGeometry,
  type BufferGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from "three";

import {type AOMode, aoModeUserData} from "../../bake/aoMode";
import {CHAIR_PARTS} from "../../props/chairParts";
import {createGridFloorMaterial} from "../../props/gridFloorMaterial";
import {buildSlabGeometry, type SlabSpec} from "../../props/slabGeometry";
import {PROP_COLOR, type Vec3} from "../../props/types";
import {getSkybox, SKY_HORIZON} from "../../scenes/environment/skybox";
import {WORLD_LIGHT} from "../../scenes/environment/worldLight";
import {
  CHAIR_POSITION,
  ROOM_FLOOR,
  ROOM_FLOOR_TILE,
  ROOM_WALLS,
} from "../../scenes/RoomScene/layout";
import {createFrostedGlassMaterial} from "../../scenes/SandboxScene/frostedGlass";
import {
  PARTITION_AXIS,
  ZONE_CHAIR,
  ZONE_COUNT,
  ZONE_FLOOR,
  ZONE_FLOOR_TILE,
  ZONE_PARTITION,
  ZONE_ROOF,
  ZONE_WALLS,
  seatYaw,
} from "../../scenes/SandboxScene/layout";

export type ProxySceneName = "room" | "sandbox";

export type ProxyScene = {scene: Scene; dispose(): void};

type Box = {position: Vec3; size: Vec3};

export const createProxyScene = (name: ProxySceneName): ProxyScene => {
  const scene = new Scene();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const disposers: (() => void)[] = [];

  const wallMaterial = new MeshStandardMaterial({color: PROP_COLOR});
  materials.push(wallMaterial);

  const addBox = (
    parent: Group | Scene,
    {position, size}: Box,
    material: Material,
    ao?: AOMode,
  ) => {
    const geometry = new BoxGeometry(...size);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.userData = aoModeUserData(ao);
    mesh.position.set(...position);
    parent.add(mesh);
  };

  const addSlab = (
    parent: Group,
    spec: SlabSpec,
    material: Material,
    ao?: AOMode,
  ) => {
    const geometry = buildSlabGeometry(spec.polygon, spec.offset);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.userData = aoModeUserData(ao);
    parent.add(mesh);
  };

  const addChair = (
    parent: Group | Scene,
    position: Vec3,
    yaw: number,
    material: Material,
    ao?: AOMode,
  ) => {
    const chair = new Group();
    chair.position.set(...position);
    chair.rotation.y = yaw;
    for (const part of CHAIR_PARTS) {
      addBox(chair, part, material, ao);
    }
    parent.add(chair);
  };

  if (name === "room") {
    const floor = createGridFloorMaterial(ROOM_FLOOR_TILE);
    disposers.push(floor.dispose);
    addBox(scene, ROOM_FLOOR, floor.material);
    for (const wall of ROOM_WALLS) {
      addBox(scene, wall, wallMaterial);
    }
    const chairMaterial = new MeshStandardMaterial({color: PROP_COLOR});
    materials.push(chairMaterial);
    addChair(scene, CHAIR_POSITION, 0, chairMaterial, "realtime");
  } else {
    const floor = createGridFloorMaterial(ZONE_FLOOR_TILE);
    disposers.push(floor.dispose);
    const glass = createFrostedGlassMaterial(PARTITION_AXIS);
    materials.push(glass);
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      const group = new Group();
      group.rotation.y = seatYaw(zone + 1);
      addSlab(group, ZONE_FLOOR, floor.material);
      for (const wall of ZONE_WALLS) {
        addBox(group, wall, wallMaterial);
      }
      addSlab(group, ZONE_PARTITION, glass, "realtime");
      addSlab(group, ZONE_ROOF, wallMaterial);
      addChair(group, ZONE_CHAIR.position, ZONE_CHAIR.yaw, wallMaterial);
      scene.add(group);
    }
  }

  scene.fog = new Fog(SKY_HORIZON, 15, 90);
  scene.backgroundNode = getSkybox().node;
  const {hemisphere, sun: sunLight} = WORLD_LIGHT;
  scene.add(
    new HemisphereLight(
      hemisphere.sky,
      hemisphere.ground,
      hemisphere.intensity,
    ),
  );
  const sun = new DirectionalLight(sunLight.color, sunLight.intensity);
  sun.position.set(...sunLight.position);
  scene.add(sun);

  return {
    scene,
    dispose: () => {
      for (const g of geometries) {
        g.dispose();
      }
      for (const m of materials) {
        m.dispose();
      }
      for (const d of disposers) {
        d();
      }
      scene.backgroundNode = null;
      scene.clear();
    },
  };
};
