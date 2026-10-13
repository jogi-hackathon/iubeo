import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {memo, useEffect, useLayoutEffect, useMemo, useState} from "react";
import type {Mesh} from "three";
import {color as colorNode} from "three/tsl";
import {MeshStandardNodeMaterial} from "three/webgpu";

import {createRenderer} from "../core/renderer";
import {CanvasPaper} from "../objects/canvas/CanvasPaper";
import {
  applyCorruption,
  directoryCorruption,
} from "../objects/directory/corruption";
import {DirectoryFire} from "../objects/directory/DirectoryFire";
import {
  buildCoreGeometry,
  buildSheetsGeometry,
} from "../objects/directory/geometry";
import {
  buildMountain,
  DIRECTORY_MOUNTAIN_SEED,
} from "../objects/directory/mountain";
import {createPaperMaterial} from "../objects/directory/paperMaterial";
import {BOOT_MS, BootScreen} from "../objects/pc/bootScreen";
import {createCrtMaterial} from "../objects/pc/crtMaterial";
import {desktopScreen} from "../objects/pc/desktop/DesktopProgram";
import {PcModel} from "../objects/pc/PcModel";
import {createPlayerState, PlayerSkeleton} from "../player";
import {Ball, Chair} from "../props";
import {WORLD_LIGHT} from "../scenes/environment/worldLight";
import type {WorldScene} from "./kodawariContent";

/**
 * 世界観のこだわりで、項目ごとに右側へゲームの実物を描く(床や背景は描かず、オブジェクトだけを浮かべる)。
 * ゲームは裏で動き続けているので、当たり判定や AO のベイクの登録(BVHCollider・BakeTarget)は使わず、
 * 共有のユニフォーム(ディレクトリの侵食)は外すときに元へ戻す
 */

const SCENES: readonly WorldScene[] = [
  "light",
  "pc",
  "canvas",
  "ragdoll",
  "directory",
];

/** 隠している間に各場面を順に 1 度ずつ描いて、シェーダーを用意しておく間隔(ms) */
const WARM_INTERVAL_MS = 1500;

function View({
  position,
  target,
  fov,
}: {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(...position);
    if ("fov" in camera) {
      camera.fov = fov;
    }
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, position, target, fov]);
  return null;
}

function WorldLight() {
  const {hemisphere, sun} = WORLD_LIGHT;
  return (
    <>
      <hemisphereLight
        args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]}
      />
      <directionalLight
        color={sun.color}
        intensity={sun.intensity}
        position={sun.position}
      />
    </>
  );
}

/** 同じ場面を一定の間隔で最初から見せ直す(key を変えてマウントし直す) */
const useReplay = (periodMs: number): number => {
  const [round, setRound] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setRound((r) => r + 1), periodMs);
    return () => window.clearInterval(id);
  }, [periodMs]);
  return round;
};

function LightScene() {
  return (
    <>
      <View position={[2.4, 1.5, 2.8]} target={[0, 0.45, 0]} fov={40} />
      <WorldLight />
      <Chair position={[0, 0, 0]} yaw={0.5} />
      <Ball position={[1.1, 0.3, 0.6]} radius={0.3} />
    </>
  );
}

function PcScene() {
  const boot = useMemo(() => {
    const screen = new BootScreen();
    const crt = createCrtMaterial(screen.texture, screen.width, screen.height);
    return {screen, crt};
  }, []);
  const desktop = useMemo(() => {
    const screen = desktopScreen();
    return createCrtMaterial(screen.texture, screen.width, screen.height);
  }, []);
  useEffect(
    () => () => {
      boot.crt.material.dispose();
      desktop.material.dispose();
    },
    [boot, desktop],
  );
  const [booted, setBooted] = useState(false);
  const startedAt = useMemo(() => ({value: -1}), []);

  useFrame(({clock}, dt) => {
    if (startedAt.value < 0) {
      startedAt.value = clock.elapsedTime;
    }
    const elapsed = (clock.elapsedTime - startedAt.value) * 1000;
    for (const crt of [boot.crt, desktop]) {
      crt.time.value += dt;
      crt.on.value = 1;
      crt.boot.value = Math.min(1, crt.boot.value + dt * 2);
    }
    if (!booted) {
      boot.screen.paint(elapsed);
      if (elapsed >= BOOT_MS) {
        setBooted(true);
      }
      return;
    }
    const screen = desktopScreen();
    screen.tick();
    if (screen.isDirty()) {
      screen.texture.needsUpdate = true;
      screen.clearDirty();
    }
  });

  const screenRef = useMemo(() => ({current: null as Mesh | null}), []);
  return (
    <>
      <View position={[0.32, 0.34, 1.05]} target={[0, 0.16, 0]} fov={40} />
      <WorldLight />
      <PcModel
        screen={booted ? desktop.material : boot.crt.material}
        screenRef={screenRef}
      />
    </>
  );
}

/** 描いて 3 秒で絵が現れ、1 秒消えてから描き直す */
function CanvasScene() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let on = false;
    const flip = () => {
      on = !on;
      setActive(on);
      id = window.setTimeout(flip, on ? 3200 : 1000);
    };
    let id = window.setTimeout(flip, 400);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <>
      <View position={[0, 1.3, 1.5]} target={[0, 1.22, 0]} fov={40} />
      <WorldLight />
      <CanvasPaper active={active} />
    </>
  );
}

const RAGDOLL_DELAY_MS = 900;

function Ragdoll({warming}: {warming: boolean}) {
  const state = useMemo(() => createPlayerState(0, 0, 0), []);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    // 隠して用意している間は倒さない(倒れる音が鳴るため)
    if (warming) {
      return;
    }
    const id = window.setTimeout(() => setDead(true), RAGDOLL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [warming]);
  return <PlayerSkeleton state={state} ragdoll={dead} />;
}

/** 倒れて燃え尽きるまでを見せ、最初から繰り返す。床は描かず、当たり判定は裏のゲームの部屋の床を使う */
function RagdollScene({warming}: {warming: boolean}) {
  const round = useReplay(7000);
  return (
    <>
      <View position={[1.7, 1.3, 2.1]} target={[0, 0.4, 0]} fov={45} />
      <Ragdoll key={round} warming={warming} />
    </>
  );
}

/** 書類の山に火をつけて、侵食されて抜け落ちるまで(CORRUPT_SECONDS)を繰り返す */
function DirectoryScene() {
  const model = useMemo(() => {
    const mountain = buildMountain(DIRECTORY_MOUNTAIN_SEED, "large");
    const core = new MeshStandardNodeMaterial({flatShading: true});
    applyCorruption(core, colorNode("#ffffff").rgb);
    return {
      mountain,
      coreGeometry: buildCoreGeometry(mountain.core),
      sheetsGeometry: buildSheetsGeometry(
        mountain.sheets,
        mountain.looseSheets,
      ),
      core,
      paper: createPaperMaterial({merged: true}),
    };
  }, []);
  useLayoutEffect(() => {
    const {baseY, height} = directoryCorruption;
    const saved = {baseY: baseY.value, height: height.value};
    baseY.value = 0;
    height.value = model.mountain.height;
    return () => {
      baseY.value = saved.baseY;
      height.value = saved.height;
    };
  }, [model]);
  useEffect(
    () => () => {
      model.coreGeometry.dispose();
      model.sheetsGeometry.dispose();
      model.core.dispose();
      model.paper.dispose();
    },
    [model],
  );
  const round = useReplay(11000);
  const height = model.mountain.height;
  return (
    <>
      <View
        position={[5.5, height * 1.1 + 1.5, 6.5]}
        target={[0, height * 0.4, 0]}
        fov={40}
      />
      <WorldLight />
      <mesh geometry={model.coreGeometry} material={model.core} />
      <mesh geometry={model.sheetsGeometry} material={model.paper} />
      <DirectoryFire key={round} position={[0, 0, 0]} size="large" />
    </>
  );
}

function Scene({scene, warming}: {scene: WorldScene; warming: boolean}) {
  switch (scene) {
    case "light":
      return <LightScene />;
    case "pc":
      return <PcScene />;
    case "canvas":
      return <CanvasScene />;
    case "ragdoll":
      return <RagdollScene warming={warming} />;
    case "directory":
      return <DirectoryScene />;
  }
}

/**
 * scene が null の間は隠しておき、各場面を 1 度ずつ描いてシェーダーを用意する(新しい Canvas は用意に数秒かかるため)。
 * プレゼンの画面は毎フレーム描き直すので、props が変わったときだけ描き直す
 */
export const WorldShowcase = memo(function WorldShowcase({
  scene,
}: {
  scene: WorldScene | null;
}) {
  const [warm, setWarm] = useState(0);
  const warming = scene === null;
  useEffect(() => {
    if (!warming || warm >= SCENES.length) {
      return;
    }
    const id = window.setTimeout(() => setWarm((w) => w + 1), WARM_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [warming, warm]);
  // 用意が済んだら、共有のユニフォームを動かさない場面(光)に戻して待つ
  const shown = scene ?? SCENES[warm] ?? SCENES[0]!;
  return (
    <div
      className="present-world-showcase"
      style={warming ? {visibility: "hidden"} : undefined}
    >
      {/* 背景は透明にして、黒いスライドの上にオブジェクトだけを浮かべる */}
      <Canvas
        gl={createRenderer}
        dpr={2}
        onCreated={({gl}) => gl.setClearColor("#000", 0)}
      >
        <Scene key={shown} scene={shown} warming={warming} />
      </Canvas>
    </div>
  );
});
