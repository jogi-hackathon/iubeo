import {useThree} from "@react-three/fiber";
import {type Ref, useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {CanvasTexture, type Mesh, SRGBColorSpace} from "three/webgpu";

import {aoModeUserData} from "../../../bake/aoMode";
import {MEMO} from "../dimensions";
import {createPointerPick} from "../display/pointerPick";
import {type TaskStore, taskStore, useTask} from "./task";

const PIXELS = {width: 512, height: 358} as const;

const JA_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';

/** PC の左に置くお題のメモ(PC の座標系に置く)。clickable の間は、クリックで別のお題を引く */
export function PcTaskMemo({
  clickable = false,
  store = taskStore,
}: {
  clickable?: boolean;
  store?: TaskStore;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const memoRef = useRef<Mesh>(null);

  useEffect(() => {
    if (!clickable) {
      return;
    }
    const canvas = gl.domElement;
    const hitOf = createPointerPick(canvas, camera);
    const onPointerDown = (event: PointerEvent) => {
      if (!hitOf(event, memoRef.current)) {
        return;
      }
      event.preventDefault();
      store.draw();
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    return () => canvas.removeEventListener("pointerdown", onPointerDown);
  }, [clickable, gl, camera, store]);

  return (
    <group
      position={[MEMO.x, 0, MEMO.z]}
      rotation={[MEMO.tilt, 0, 0]}
      userData={aoModeUserData("realtime")}
    >
      <TaskMemo ref={memoRef} store={store} />
    </group>
  );
}

export function TaskMemo({
  ref,
  store = taskStore,
}: {
  ref?: Ref<Mesh>;
  store?: TaskStore;
}) {
  const task = useTask(store);
  const {canvas, texture} = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PIXELS.width;
    canvas.height = PIXELS.height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return {canvas, texture};
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  useLayoutEffect(() => {
    paintMemo(canvas, task);
    texture.needsUpdate = true;
  }, [canvas, texture, task]);

  return (
    <mesh ref={ref} position={[0, MEMO.height / 2, 0]}>
      <planeGeometry args={[MEMO.width, MEMO.height]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}

/** メモの表面を描く。お題の語は、幅に収まる最大のサイズまで大きくする */
export const paintMemo = (canvas: HTMLCanvasElement, task: string): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const {width, height} = canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8d8d4";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);

  ctx.fillStyle = "#1d1d1f";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `600 34px ${JA_FONT}`;
  ctx.fillText("お題", 40, 56);

  ctx.font = `bold ${fitFontSize(ctx, task, width - 80)}px ${JA_FONT}`;
  ctx.fillText(task, 40, height / 2 + 6, width - 80);

  ctx.fillStyle = "#6e6e73";
  ctx.font = `20px ${JA_FONT}`;
  ctx.fillText(
    "クリックで引き直す ・ Esc で離れる",
    40,
    height - 40,
    width - 80,
  );
};

const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): number => {
  const MAX = 96;
  const MIN = 28;
  for (let size = MAX; size > MIN; size -= 4) {
    ctx.font = `bold ${size}px ${JA_FONT}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
  }
  return MIN;
};
