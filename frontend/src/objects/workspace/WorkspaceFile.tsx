import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {
  CanvasTexture,
  type Group,
  type Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

import {UNDER_SHEET_COLOR, UNDER_SHEET_OFFSET} from "../paperSheet";
import {WORKSPACE_ACTION_MS} from "./data";
import {FILE_POSITION, FILE_SIZE} from "./desk";
import {
  createWritingScript,
  cursorAt,
  PAGE,
  paintPage,
  type WritingScript,
} from "./writing";

export const FILE_SECONDS = 0.4;
const FILE_RISE = 0.04;
const VISIBLE_THRESHOLD = 0.05;
const WRITE_START_MS = FILE_SECONDS * 1000;
const WRITE_END_MARGIN_MS = 100;
const WRITE_MS = WORKSPACE_ACTION_MS - WRITE_START_MS - WRITE_END_MARGIN_MS;
const CURSOR_BLINK_HZ = 2;
const CURSOR_WIDTH = 0.004;
const SHEET_LIFT = 0.0005;
const CURSOR_LIFT = SHEET_LIFT * 2;
const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

const PLANE = new PlaneGeometry(1, 1);

const toMeters = (px: number, py: number): [number, number] => [
  (px / PAGE.width - 0.5) * FILE_SIZE[0],
  (py / PAGE.height - 0.5) * FILE_SIZE[1],
];

export function WorkspaceFile({working}: {working: boolean}) {
  const root = useRef<Group>(null);
  const cursor = useRef<Mesh>(null);
  const state = useRef({
    progress: 0,
    wasWorking: false,
    elapsed: 0,
    drawn: -1,
    script: null as WritingScript | null,
  });

  const {canvas, texture, paper, underSheet, cursorMaterial} = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE.width;
    canvas.height = PAGE.height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const paper = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
    });
    const cursorMaterial = new MeshStandardMaterial({
      color: "#555555",
      transparent: true,
      opacity: 0,
    });
    const underSheet = new MeshStandardMaterial({
      color: UNDER_SHEET_COLOR,
      transparent: true,
      opacity: 0,
    });
    return {canvas, texture, paper, underSheet, cursorMaterial};
  }, []);

  useEffect(
    () => () => {
      texture.dispose();
      paper.dispose();
      underSheet.dispose();
      cursorMaterial.dispose();
    },
    [texture, paper, underSheet, cursorMaterial],
  );

  useFrame((_, dt) => {
    const s = state.current;
    if (working && !s.wasWorking) {
      s.elapsed = 0;
      s.drawn = -1;
      s.script = createWritingScript(Date.now() >>> 0, WRITE_MS);
    }
    s.wasWorking = working;
    if (working) {
      s.elapsed += dt;
    }

    const target = working ? 1 : 0;
    const step = dt / FILE_SECONDS;
    s.progress =
      target > s.progress
        ? Math.min(target, s.progress + step)
        : Math.max(target, s.progress - step);
    const eased = easeOut(s.progress);
    const group = root.current;
    if (group) {
      group.visible = eased > VISIBLE_THRESHOLD;
      group.position.y = FILE_POSITION[1] + FILE_RISE * (1 - eased);
    }
    paper.opacity = eased;
    underSheet.opacity = eased;
    cursorMaterial.opacity = eased;

    const script = s.script;
    const cursorMesh = cursor.current;
    if (!script || !cursorMesh) {
      return;
    }
    const writeMs = s.elapsed * 1000 - WRITE_START_MS;
    const count = working
      ? script.beats.filter((beat) => beat.at <= writeMs).length
      : s.drawn;
    if (count !== s.drawn) {
      s.drawn = count;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        paintPage(ctx, script, count);
        texture.needsUpdate = true;
      }
      const at = cursorAt(script, count);
      const line = script.lines[at.line]!;
      const [x, z] = toMeters(at.x, line.y);
      cursorMesh.position.set(x, CURSOR_LIFT, z);
      cursorMesh.scale.y = (line.height / PAGE.height) * FILE_SIZE[1];
    }
    const writing = working && writeMs >= 0;
    cursorMesh.visible =
      writing && Math.floor(s.elapsed * CURSOR_BLINK_HZ * 2) % 2 === 0;
  });

  return (
    <group ref={root} position={FILE_POSITION} visible={false}>
      <mesh
        geometry={PLANE}
        material={underSheet}
        position={[UNDER_SHEET_OFFSET, 0, UNDER_SHEET_OFFSET]}
        rotation={FLAT}
        scale={[FILE_SIZE[0], FILE_SIZE[1], 1]}
      />
      <mesh
        geometry={PLANE}
        material={paper}
        position={[0, SHEET_LIFT, 0]}
        rotation={FLAT}
        scale={[FILE_SIZE[0], FILE_SIZE[1], 1]}
      />
      <mesh
        ref={cursor}
        geometry={PLANE}
        material={cursorMaterial}
        rotation={FLAT}
        scale={[CURSOR_WIDTH, 0.01, 1]}
        visible={false}
      />
    </group>
  );
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
