import {Canvas, useFrame} from "@react-three/fiber";
import {createRoot} from "react-dom/client";

import {createRenderer} from "../../../core/renderer";
import {EYE_FORWARD, EYE_HEIGHT} from "../../../player/constants";
import {SAMPLE_SLIP} from "../content";
import {HandheldTerminal} from "../HandheldTerminal";
import {stageStart, TERMINAL_SEQUENCE_MS} from "../terminal";

const HAND: [number, number, number] = [0, 1.48, -0.51];
const EYE: [number, number, number] = [0, EYE_HEIGHT, -EYE_FORWARD];
const AIM: [number, number, number] = [0, 1.5, -0.6];
const FOV = 75;
const CLOSE_FOV = 32;
const LOOP_REST_MS = 800;

interface Frame {
  label: string;
  at: number;
}

const FRAMES: readonly Frame[] = [
  {label: "持ち上げ", at: stageStart("raise") + 300},
  {label: "受信", at: stageStart("receive") + 200},
  {label: "印刷中", at: stageStart("print") + 900},
  {label: "印刷完了", at: stageStart("feed") + 100},
  {label: "千切る", at: stageStart("tear") + 140},
  {label: "見る", at: stageStart("look") + 1000},
];

const TILE = {width: 400, height: 460} as const;
const LIVE = {width: 960, height: 720} as const;

declare global {
  interface Window {
    __slipShotReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const live = params.has("live");

let readyCount = 0;
function Ready({frames = 8, of}: {frames?: number; of: number}) {
  let count = 0;
  useFrame(() => {
    count += 1;
    if (count === frames) {
      readyCount += 1;
      if (readyCount >= of) {
        window.__slipShotReady = true;
      }
    }
  });
  return null;
}

function View({
  elapsedMs,
  of,
  fov = FOV,
}: {
  elapsedMs?: () => number;
  of: number;
  fov?: number;
}) {
  return (
    <Canvas
      gl={createRenderer}
      dpr={2}
      frameloop="always"
      camera={{position: EYE, fov, near: 0.02, far: 50}}
      onCreated={({camera}) => {
        camera.lookAt(...AIM);
      }}
    >
      <color attach="background" args={["#eceae6"]} />
      <group position={HAND}>
        <HandheldTerminal
          content={SAMPLE_SLIP}
          {...(elapsedMs && {elapsedMs})}
        />
      </group>
      <Ready of={of} />
    </Canvas>
  );
}

function Label({children}: {children: string}) {
  return (
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
      {children}
    </div>
  );
}

function LivePage() {
  const started = performance.now();
  const period = TERMINAL_SEQUENCE_MS + LOOP_REST_MS;
  const elapsedMs = () => (performance.now() - started) % period;
  return (
    <div id="shots" style={{background: "#eceae6", position: "relative"}}>
      <div style={{width: LIVE.width, height: LIVE.height}}>
        <View elapsedMs={elapsedMs} of={1} />
      </div>
      <Label>live(繰り返し)</Label>
    </div>
  );
}

const ROWS = [
  {label: "一人称", fov: FOV},
  {label: "寄り", fov: CLOSE_FOV},
] as const;

function FramesPage() {
  return (
    <div id="shots" style={{background: "#eceae6"}}>
      {ROWS.map((row) => (
        <div key={row.label} style={{display: "flex"}}>
          {FRAMES.map((frame) => (
            <div
              key={frame.label}
              style={{width: TILE.width, position: "relative"}}
            >
              <div style={{width: TILE.width, height: TILE.height}}>
                <View
                  elapsedMs={() => frame.at}
                  of={FRAMES.length * ROWS.length}
                  fov={row.fov}
                />
              </div>
              <Label>{`${frame.label} / ${frame.at}ms / ${row.label}`}</Label>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
createRoot(root).render(live ? <LivePage /> : <FramesPage />);
