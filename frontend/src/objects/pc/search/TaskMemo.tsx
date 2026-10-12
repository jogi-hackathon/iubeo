import {useEffect, useLayoutEffect, useMemo} from "react";
import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import {aoModeUserData} from "../../../bake/aoMode";
import {MEMO} from "../dimensions";

const PIXELS = {width: 512, height: 358} as const;

const JA_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';

/** PC の左に置くお題のメモ(PC の座標系に置く) */
export function PcTaskMemo({topic = null}: {topic?: string | null}) {
  return (
    <group
      position={[MEMO.x, 0, MEMO.z]}
      rotation={[MEMO.tilt, 0, 0]}
      userData={aoModeUserData("realtime")}
    >
      <TaskMemo topic={topic} />
    </group>
  );
}

export function TaskMemo({topic}: {topic: string | null}) {
  const {canvas, texture} = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = PIXELS.width;
    canvas.height = PIXELS.height;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return {canvas, texture};
  }, []);

  useLayoutEffect(() => {
    paintMemo(canvas, topic);
    texture.needsUpdate = true;
  }, [canvas, texture, topic]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, MEMO.height / 2, 0]}>
      <planeGeometry args={[MEMO.width, MEMO.height]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}

/** メモの表面を描く。お題の語は、幅に収まる最大のサイズまで大きくする。お題が無いときは「なし」 */
export const paintMemo = (
  canvas: HTMLCanvasElement,
  topic: string | null,
): void => {
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

  const word = topic ?? "なし";
  ctx.font = `bold ${fitFontSize(ctx, word, width - 80)}px ${JA_FONT}`;
  ctx.fillText(word, 40, height / 2 + 6, width - 80);

  ctx.fillStyle = "#6e6e73";
  ctx.font = `20px ${JA_FONT}`;
  ctx.fillText("Esc で離れる", 40, height - 40, width - 80);
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
