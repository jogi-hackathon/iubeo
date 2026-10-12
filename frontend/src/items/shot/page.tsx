import {Canvas, useFrame} from "@react-three/fiber";
import {createRoot} from "react-dom/client";

import {createRenderer} from "../../core/renderer";
import {EYE_FORWARD, EYE_HEIGHT} from "../../player/constants";
import {FILE_KIND, type FileStatus} from "../file";
import {HeldItem} from "../HeldItem";

interface View {
  label: string;
  position: [number, number, number];
  fov: number;
}

const HAND: [number, number, number] = [0, 1.48, -0.51];

const VIEWS: readonly View[] = [
  {label: "一人称", position: [0, EYE_HEIGHT, -EYE_FORWARD], fov: 75},
  {label: "一人称・寄り", position: [0, EYE_HEIGHT, -EYE_FORWARD], fov: 30},
  {label: "正面(他プレイヤー)", position: [0, EYE_HEIGHT, -1.6], fov: 40},
  {label: "斜め", position: [0.5, 1.7, -0.1], fov: 30},
];

const TILE = {width: 480, height: 400} as const;

declare global {
  interface Window {
    __fileShotReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const status = (params.get("status") ?? "unedited") as FileStatus;
const color = params.get("color") ?? "#5b7be0";
const item = {id: "shot", kind: FILE_KIND, data: {status, color}};

let readyCount = 0;
function Ready({frames = 6}: {frames?: number}) {
  let count = 0;
  useFrame(() => {
    count += 1;
    if (count === frames) {
      readyCount += 1;
      if (readyCount >= VIEWS.length) {
        window.__fileShotReady = true;
      }
    }
  });
  return null;
}

function Shot({view}: {view: View}) {
  return (
    <Canvas
      gl={createRenderer}
      dpr={2}
      frameloop="always"
      camera={{position: view.position, fov: view.fov, near: 0.02, far: 50}}
      onCreated={({camera}) => {
        camera.lookAt(...HAND);
      }}
    >
      <color attach="background" args={["#eceae6"]} />
      <group position={HAND}>
        <HeldItem item={item} />
      </group>
      <Ready />
    </Canvas>
  );
}

function Page() {
  return (
    <div id="shots" style={{display: "flex", background: "#eceae6"}}>
      {VIEWS.map((view) => (
        <div key={view.label} style={{width: TILE.width, position: "relative"}}>
          <div style={{width: TILE.width, height: TILE.height}}>
            <Shot view={view} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 10,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.82)",
              font: "13px sans-serif",
            }}
          >
            {status} / {view.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
createRoot(root).render(<Page />);
