import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  type Texture,
  Vector3,
} from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {registerShaderSwatch} from "../../core/shaderSwatches";
import type {SlipContent} from "./content";
import {paintScreen, SCREEN_CANVAS, screenKey} from "./screen";
import {
  canvasTexture,
  createSlipTexture,
  createStripGeometry,
  shapeStrip,
  slipBackTexture,
} from "./slipPaper";
import {SLIP_LENGTH} from "./strip";
import {
  PAPER_CURL,
  PAPER_STUB,
  SLIP_EXIT,
  SLIP_LOOK,
  TERMINAL_OUTLINE,
  TERMINAL_PARTS,
  TERMINAL_SCREEN,
  type TerminalPart,
  type TerminalPartLook,
  terminalPose,
} from "./terminal";

const FILL_COLOR = "#ffffff";
const OUTLINE_COLOR = "#1a1a1a";
const CYLINDER_SEGMENTS = 10;
const ROUNDED_SEGMENTS = 2;
const SCREEN_TICK_HZ = 4;
const JITTER_HZ = {x: 37, y: 28} as const;
const BACK_OFFSET = 0.00015;

const basic = (options: ConstructorParameters<typeof MeshBasicMaterial>[0]) => {
  const material = new MeshBasicMaterial(options);
  setSkipGTAO(material, true);
  return material;
};

const FILL = basic({color: FILL_COLOR});
const ACCENT = basic({color: OUTLINE_COLOR});
const OUTLINE = basic({color: OUTLINE_COLOR, side: BackSide});
const LOOKS: Record<TerminalPartLook, MeshBasicMaterial> = {
  body: FILL,
  accent: ACCENT,
  key: FILL,
};

const partGeometry = (part: TerminalPart, inflate: number): BufferGeometry => {
  const [x, y, z] = part.scale;
  if (part.shape === "cylinder") {
    return new CylinderGeometry(
      x + inflate,
      z + inflate,
      y + 2 * inflate,
      CYLINDER_SEGMENTS,
    );
  }
  if (part.radius) {
    return new RoundedBoxGeometry(
      x + 2 * inflate,
      y + 2 * inflate,
      z + 2 * inflate,
      ROUNDED_SEGMENTS,
      part.radius + inflate,
    );
  }
  return new BoxGeometry(x + 2 * inflate, y + 2 * inflate, z + 2 * inflate);
};

type Built = {
  part: TerminalPart;
  fill: BufferGeometry;
  outline: BufferGeometry | null;
};

let built: readonly Built[] | null = null;
const buildParts = (): readonly Built[] =>
  (built ??= TERMINAL_PARTS.map((part) => ({
    part,
    fill: partGeometry(part, 0),
    outline: part.look === "body" ? partGeometry(part, TERMINAL_OUTLINE) : null,
  })));

function Part({part, fill, outline}: Built) {
  const rotation = part.rotation && {rotation: part.rotation};
  return (
    <>
      <mesh
        geometry={fill}
        material={LOOKS[part.look]}
        position={part.position}
        frustumCulled={false}
        {...rotation}
      />
      {outline && (
        <mesh
          geometry={outline}
          material={OUTLINE}
          position={part.position}
          frustumCulled={false}
          {...rotation}
        />
      )}
    </>
  );
}

const SCREEN_PLANE = new PlaneGeometry(1, 1);

const createMaterials = (screen: Texture, front: Texture) => ({
  screenMaterial: basic({map: screen}),
  frontMaterial: basic({map: front, alphaTest: 0.5, side: FrontSide}),
  backMaterial: basic({map: slipBackTexture(), alphaTest: 0.5, side: BackSide}),
  stubMaterial: basic({color: FILL_COLOR, side: DoubleSide}),
});

registerShaderSwatch("handheldTerminal", () => {
  const group = new Group();
  for (const {part, fill, outline} of buildParts()) {
    group.add(new Mesh(fill, LOOKS[part.look]));
    if (outline) {
      group.add(new Mesh(outline, OUTLINE));
    }
  }
  const back = slipBackTexture();
  const m = createMaterials(back, back);
  const strip = createStripGeometry();
  group.add(
    new Mesh(SCREEN_PLANE, m.screenMaterial),
    new Mesh(strip, m.frontMaterial),
    new Mesh(strip, m.backMaterial),
    new Mesh(strip, m.stubMaterial),
  );
  return group;
});

const slotPosition = new Vector3();
const slotQuaternion = new Quaternion();
const lookPosition = new Vector3();
const lookQuaternion = new Quaternion();
const tearQuaternion = new Quaternion();
const offset = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);

export type HandheldTerminalProps = {
  content: SlipContent;
  elapsedMs?: () => number;
  onLaunch?: (slipWorld: Matrix4) => void;
  slipWorld?: Matrix4;
};

export function HandheldTerminal({
  content,
  elapsedMs,
  onLaunch,
  slipWorld,
}: HandheldTerminalProps) {
  const device = useRef<Group>(null);
  const slip = useRef<Group>(null);
  const stub = useRef<Mesh>(null);
  const startedAt = useRef<number | null>(null);
  const screenDrawn = useRef("");
  const launched = useRef(false);
  const parts = useMemo(buildParts, []);

  const res = useMemo(() => {
    const screen = canvasTexture(SCREEN_CANVAS.width, SCREEN_CANVAS.height);
    const front = createSlipTexture(content);
    return {
      screen,
      front,
      ...createMaterials(screen.texture, front),
      strip: createStripGeometry(),
      stubStrip: createStripGeometry(),
    };
  }, [content]);

  useEffect(
    () => () => {
      res.screen.texture.dispose();
      res.front.dispose();
      res.screenMaterial.dispose();
      res.frontMaterial.dispose();
      res.backMaterial.dispose();
      res.stubMaterial.dispose();
      res.strip.dispose();
      res.stubStrip.dispose();
    },
    [res],
  );

  useEffect(() => {
    shapeStrip(res.stubStrip, {length: PAPER_STUB, curl: PAPER_CURL.rest});
  }, [res]);

  useFrame(({clock}) => {
    const now = clock.elapsedTime * 1000;
    startedAt.current ??= now;
    const elapsed = elapsedMs ? elapsedMs() : now - startedAt.current;
    const pose = terminalPose(elapsed);

    const d = device.current;
    const s = slip.current;
    if (!d || !s) {
      return;
    }
    const seconds = elapsed / 1000;
    d.position.set(
      pose.device.jitter * Math.sin(seconds * 2 * Math.PI * JITTER_HZ.x),
      pose.device.y +
        pose.device.jitter * Math.sin(seconds * 2 * Math.PI * JITTER_HZ.y),
      pose.device.z,
    );
    d.rotation.set(pose.device.tilt, 0, 0);

    slotQuaternion.copy(d.quaternion);
    slotPosition
      .fromArray(SLIP_EXIT)
      .applyQuaternion(slotQuaternion)
      .add(d.position);

    const {paper} = pose;
    if (paper.launched && !launched.current) {
      launched.current = true;
      s.updateWorldMatrix(true, false);
      onLaunch?.(s.matrixWorld);
    }
    s.visible = !paper.launched;
    if (paper.torn) {
      lookQuaternion.setFromAxisAngle(X_AXIS, SLIP_LOOK.tilt);
      offset.set(0, -SLIP_LENGTH / 2, 0).applyQuaternion(lookQuaternion);
      lookPosition.fromArray(SLIP_LOOK.center).add(offset);
      s.position.lerpVectors(slotPosition, lookPosition, paper.toLook);
      s.quaternion.slerpQuaternions(
        slotQuaternion,
        lookQuaternion,
        paper.toLook,
      );
      tearQuaternion.setFromAxisAngle(X_AXIS, paper.tearTilt);
      s.quaternion.multiply(tearQuaternion);
    } else {
      s.position.copy(slotPosition);
      s.quaternion.copy(slotQuaternion);
    }
    shapeStrip(res.strip, {length: paper.length, curl: paper.curl});
    if (slipWorld && !paper.launched) {
      s.updateWorldMatrix(true, false);
      slipWorld.copy(s.matrixWorld);
    }

    const st = stub.current;
    if (st) {
      st.visible = paper.torn;
      st.position.copy(slotPosition);
      st.quaternion.copy(slotQuaternion);
    }

    const frame = {
      status: pose.screen.status,
      progress: pose.screen.progress,
      tick: Math.floor(seconds * SCREEN_TICK_HZ),
    };
    const key = screenKey(frame);
    if (key !== screenDrawn.current) {
      screenDrawn.current = key;
      paintScreen(res.screen.canvas, frame);
      res.screen.texture.needsUpdate = true;
    }
  });

  return (
    <group name="handheld-terminal">
      <group ref={device}>
        {parts.map((p, i) => (
          <Part key={i} {...p} />
        ))}
        <mesh
          geometry={SCREEN_PLANE}
          material={res.screenMaterial}
          position={TERMINAL_SCREEN.position}
          scale={[TERMINAL_SCREEN.width, TERMINAL_SCREEN.height, 1]}
          frustumCulled={false}
        />
      </group>
      <group ref={slip} name="order-slip">
        <mesh
          geometry={res.strip}
          material={res.frontMaterial}
          position={[0, 0, BACK_OFFSET]}
          frustumCulled={false}
        />
        <mesh
          geometry={res.strip}
          material={res.backMaterial}
          position={[0, 0, -BACK_OFFSET]}
          frustumCulled={false}
        />
      </group>
      <mesh
        ref={stub}
        geometry={res.stubStrip}
        material={res.stubMaterial}
        visible={false}
        frustumCulled={false}
      />
    </group>
  );
}
