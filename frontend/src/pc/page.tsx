import {Canvas, useFrame} from "@react-three/fiber";
import {useEffect, useMemo} from "react";
import {createRoot} from "react-dom/client";
import {CanvasTexture, type Mesh, SRGBColorSpace} from "three/webgpu";

import {createRenderer} from "../core/renderer";
import {createCrtMaterial} from "../objects/pc/crtMaterial";
import {PcModel} from "../objects/pc/PcModel";
import {SCREEN_CANVAS} from "../screen/browserChrome";

interface View {
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

const VIEWS: readonly View[] = [
  {
    label: "正面",
    position: [0, 0.34, 1.18],
    target: [0, 0.16, 0],
    fov: 40,
  },
  {
    label: "斜め 45°",
    position: [0.86, 0.56, 0.96],
    target: [0.03, 0.14, 0],
    fov: 42,
  },
  {
    label: "モニタ接写",
    position: [0.34, 0.34, 0.62],
    target: [0, 0.24, -0.06],
    fov: 34,
  },
];

const TILE = {width: 560, height: 500} as const;

declare global {
  interface Window {
    __pcShotReady?: boolean;
  }
}

let readyCount = 0;
function Ready({frames = 6}: {frames?: number}) {
  let count = 0;
  useFrame(() => {
    count += 1;
    if (count === frames) {
      readyCount += 1;
      if (readyCount >= VIEWS.length) {
        window.__pcShotReady = true;
      }
    }
  });
  return null;
}

const screenTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_CANVAS.width;
  canvas.height = SCREEN_CANVAS.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const {width, height} = canvas;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f1f1ef";
    ctx.fillRect(0, 0, width, 56);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(110, 10, width - 130, 36, 18);
    ctx.fill();
    ctx.strokeStyle = "#c9c9c4";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#8e8e93";
    ctx.font = "20px sans-serif";
    ctx.fillText("https://www.google.com/search?q=three.js", 126, 35);

    ctx.fillStyle = "#1d1d1f";
    ctx.font = "600 64px sans-serif";
    ctx.fillText("Search", 60, 190);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(56, 230, width - 112, 62, 31);
    ctx.fill();
    ctx.strokeStyle = "#c9c9c4";
    ctx.stroke();
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "28px sans-serif";
    ctx.fillText("three.js", 84, 272);
    for (let index = 0; index < 4; index += 1) {
      const y = 340 + index * 84;
      ctx.fillStyle = "#1a0dab";
      ctx.fillRect(56, y, 300 - index * 30, 18);
      ctx.fillStyle = "#4d4d4d";
      ctx.fillRect(56, y + 28, width - 160, 12);
      ctx.fillRect(56, y + 48, width - 260, 12);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

function DeskTop() {
  return (
    <mesh position={[0, -0.02, 0]}>
      <boxGeometry args={[1.6, 0.04, 0.8]} />
      <meshStandardMaterial color="#f4f2ec" roughness={0.85} />
    </mesh>
  );
}

function Shot({view}: {view: View}) {
  const screen = useMemo(() => {
    const controls = createCrtMaterial(
      screenTexture(),
      SCREEN_CANVAS.width,
      SCREEN_CANVAS.height,
    );
    controls.on.value = 1;
    controls.boot.value = 1;
    return controls;
  }, []);
  const screenRef = useMemo(() => ({current: null as Mesh | null}), []);
  useEffect(() => () => screen.material.dispose(), [screen]);

  return (
    <Canvas
      gl={createRenderer}
      dpr={2}
      frameloop="always"
      camera={{
        position: view.position,
        fov: view.fov,
        near: 0.02,
        far: 50,
      }}
      onCreated={({camera}) => {
        camera.lookAt(...view.target);
      }}
    >
      <color attach="background" args={["#eceae6"]} />
      <hemisphereLight args={["#ffffff", "#d8d8d8", 2.2]} />
      <directionalLight position={[8, 20, 6]} intensity={0.7} />
      <directionalLight position={[-6, 8, 10]} intensity={0.25} />
      <DeskTop />
      <PcModel screen={screen.material} screenRef={screenRef} on />
      <Ready />
    </Canvas>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}

function Page() {
  return (
    <div
      id="shots"
      style={{
        display: "flex",
        gap: 0,
        padding: 0,
        margin: 0,
        background: "#eceae6",
        font: "14px sans-serif",
        color: "#1d1d1f",
      }}
    >
      {VIEWS.map((view) => (
        <div key={view.label} style={{width: TILE.width, position: "relative"}}>
          <div style={{width: TILE.width, height: TILE.height}}>
            <Shot view={view} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: 12,
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.82)",
            }}
          >
            {view.label}
          </div>
        </div>
      ))}
    </div>
  );
}

createRoot(root).render(<Page />);
