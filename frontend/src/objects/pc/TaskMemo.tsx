import {type Ref, useEffect, useLayoutEffect, useMemo} from "react";
import {CanvasTexture, type Mesh, SRGBColorSpace} from "three/webgpu";

import {MEMO} from "./dimensions";
import {type TaskStore, taskStore, useTask} from "./task";

/** メモの描画の解像度（縦横比は MEMO に合わせる） */
const PIXELS = {width: 512, height: 358} as const;

const JA_FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';

/**
 * お題のメモ（机の上の紙）。HUD を使わず、画面の外（3D の机）にお題を出す。
 * 文字はこのメモの表面に描く。クリック（PC を使っている間）で別のお題に引き直す（pcControls）。
 * 表面に描くのは、お題の語・見出し・操作の一言の 3 つだけ。
 */
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

/** 語が maxWidth に収まる、最大のフォントサイズ(px)。小さすぎれば下限で止める */
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
