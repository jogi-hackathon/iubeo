import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import {SCREEN_CANVAS} from "./display/resolution";

const BAR_BLOCKS = 20;

/** 起動画面の時間割(ms)。黒いまま管が点く → ロゴが浮かぶ → 読み込みの棒が埋まる → 少し待って消える */
const LOGO_IN = {from: 1000, to: 2000};
const BAR_SHOW = 2600;
const BAR_FILL = {from: 3000, to: 7400};
const FADE_OUT = {from: 8200, to: 9000};
/** 電源を入れてからデスクトップに切り替わるまで */
export const BOOT_MS = 9400;

/** 読み込みの棒の埋まり方。一定の速さではなく、ところどころで止まる */
const FILL_KEYS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.2, 0.3],
  [0.35, 0.35],
  [0.6, 0.7],
  [0.72, 0.72],
  [1, 1],
];

const ramp = (t: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (t - from) / (to - from)));

const fillAt = (t: number): number => {
  for (let i = 1; i < FILL_KEYS.length; i++) {
    const [x1, y1] = FILL_KEYS[i]!;
    const [x0, y0] = FILL_KEYS[i - 1]!;
    if (t <= x1) {
      return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return 1;
};

export type BootFrame = {
  /** ロゴの濃さ(0〜1) */
  logo: number;
  /** 読み込みの棒の濃さ(0〜1) */
  bar: number;
  /** 棒で埋まっているマスの数 */
  blocks: number;
};

/** 電源を入れてから elapsed ms のときの起動画面 */
export const bootFrame = (elapsed: number): BootFrame => {
  const out = 1 - ramp(elapsed, FADE_OUT.from, FADE_OUT.to);
  return {
    logo: ramp(elapsed, LOGO_IN.from, LOGO_IN.to) * out,
    bar: (elapsed >= BAR_SHOW ? 1 : 0) * out,
    blocks: Math.floor(
      fillAt(ramp(elapsed, BAR_FILL.from, BAR_FILL.to)) * BAR_BLOCKS,
    ),
  };
};

const MONO = "ui-monospace, Menlo, monospace";

/**
 * 電源を入れたときの起動画面(PcObject が起動中だけ映す)。黒地に IUBEO のロゴと読み込みの棒
 */
export class BootScreen {
  readonly texture: CanvasTexture;
  readonly width = SCREEN_CANVAS.width;
  readonly height = SCREEN_CANVAS.height;
  private readonly ctx: CanvasRenderingContext2D | null;
  private painted = "";

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = canvas.getContext("2d");
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.paint(0);
  }

  paint(elapsed: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const {width, height} = this;
    const frame = bootFrame(elapsed);
    // 見た目が変わったときだけ描いて送る(棒が止まっている間などは何もしない)
    const key = `${frame.logo.toFixed(2)} ${frame.bar.toFixed(2)} ${frame.blocks}`;
    if (key === this.painted) {
      return;
    }
    this.painted = key;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // TODO: 仮のモックアップ。IUBEO のロゴができたら、文字の描画をやめて SVG を読み込んで描く形に置き換える
    ctx.globalAlpha = frame.logo;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 84px ${MONO}`;
    ctx.fillText("IUBEO", width / 2, height / 2 - 20);

    ctx.globalAlpha = frame.bar;
    const bar = {
      x: width / 2 - 130,
      y: height / 2 + 50,
      width: 260,
      height: 14,
    };
    ctx.strokeStyle = "#909090";
    ctx.lineWidth = 2;
    ctx.strokeRect(bar.x, bar.y, bar.width, bar.height);
    const cell = (bar.width - 6) / BAR_BLOCKS;
    ctx.fillStyle = "#d8d8d8";
    for (let i = 0; i < frame.blocks; i++) {
      ctx.fillRect(
        bar.x + 3 + i * cell + 1,
        bar.y + 3,
        cell - 2,
        bar.height - 6,
      );
    }
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
