import type {GamePhase, GameTask} from "../../net";
import {taskLabels} from "../hudText";
import {SLIP_LENGTH, SLIP_WIDTH} from "./strip";

/** 伝票の 1 項目(自分に割り当てられた 1 つのタスク) */
export type SlipItem = {
  /** タスクの種類の表示名 */
  kind: string;
  /** 種類ごとの対象(検索のお題・対象ファイル)。無ければ null */
  detail: string | null;
};

/** 伝票に印字する中身。表示の文字列まで決めておき、描くだけにする */
export type SlipContent = {
  /** 伝票番号(フェーズ番号と最初のタスク id から) */
  number: string;
  phase: number;
  /** そのフェーズで自分に割り当てられたタスク(割り当ての順) */
  items: readonly SlipItem[];
  /** フェーズの制限時間(秒)。開始と締切の差 */
  limitSeconds: number | null;
};

const NUMBER_LENGTH = 8;
/** 紙に収まる項目の数。それ以上は切る */
export const SLIP_MAX_ITEMS = 4;

const limitOf = (phase: GamePhase): number | null => {
  const started = Date.parse(phase.startedAt);
  const deadline = Date.parse(phase.deadlineAt);
  if (Number.isNaN(started) || Number.isNaN(deadline)) {
    return null;
  }
  return Math.max(0, Math.round((deadline - started) / 1000));
};

const itemOf = (task: GameTask): SlipItem => ({
  kind: taskLabels[task.type],
  detail:
    task.type === "web_search"
      ? (task.topic ?? null)
      : task.type === "read_edit"
        ? task.targetFileId
        : null,
});

const numberOf = (phase: GamePhase, tasks: readonly GameTask[]): string => {
  const head = tasks[0]?.taskId ?? "";
  return `${phase.number}-${head.replace(/[^0-9a-z]/gi, "").toUpperCase()}`
    .slice(0, NUMBER_LENGTH)
    .padEnd(NUMBER_LENGTH, "0");
};

/** フェーズと、その中で自分に割り当てられたタスクから伝票を作る */
export const slipContent = (
  phase: GamePhase,
  tasks: readonly GameTask[],
): SlipContent => ({
  number: numberOf(phase, tasks),
  phase: phase.number,
  items: tasks.slice(0, SLIP_MAX_ITEMS).map(itemOf),
  limitSeconds: limitOf(phase),
});

/** 見本の伝票(撮影ページとテスト用) */
export const SAMPLE_SLIP: SlipContent = {
  number: "3-TASK31",
  phase: 3,
  items: [
    {kind: taskLabels.web_search, detail: "三葉虫"},
    {kind: taskLabels.write, detail: null},
  ],
  limitSeconds: 120,
};

/** 紙 58mm × 120mm を 320px 幅で描く */
export const SLIP_CANVAS = {
  width: 320,
  height: Math.round((320 * SLIP_LENGTH) / SLIP_WIDTH),
} as const;

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
const MONO = `"Menlo", "Courier New", ${FONT}`;
const INK = "#1a1a1a";
const EDGE = 3;
/** 上下の端のギザギザ(千切った跡)。山の幅と高さ */
const TOOTH = {width: 12, height: 7} as const;
const MARGIN = 26;

/** 紙の形(ギザギザの上下端)を path にする。外側は透明にする */
const paperPath = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.beginPath();
  ctx.moveTo(0, TOOTH.height);
  for (let x = 0; x < w; x += TOOTH.width) {
    ctx.lineTo(x + TOOTH.width / 2, 0);
    ctx.lineTo(Math.min(w, x + TOOTH.width), TOOTH.height);
  }
  ctx.lineTo(w, h - TOOTH.height);
  for (let x = w; x > 0; x -= TOOTH.width) {
    ctx.lineTo(x - TOOTH.width / 2, h);
    ctx.lineTo(Math.max(0, x - TOOTH.width), h - TOOTH.height);
  }
  ctx.closePath();
};

const paperBase = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.clearRect(0, 0, w, h);
  paperPath(ctx, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = EDGE * 2;
  ctx.strokeStyle = INK;
  ctx.save();
  ctx.clip();
  ctx.stroke();
  ctx.restore();
};

const dashed = (ctx: CanvasRenderingContext2D, y: number, w: number) => {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(w - MARGIN, y);
  ctx.stroke();
  ctx.restore();
};

/** 伝票番号から決まるバーコード風の縞 */
const barcode = (
  ctx: CanvasRenderingContext2D,
  number: string,
  y: number,
  w: number,
  h: number,
) => {
  let seed = 7;
  for (const ch of number) {
    seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  }
  ctx.fillStyle = INK;
  let x = MARGIN;
  while (x < w - MARGIN) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bar = 2 + ((seed >>> 16) & 3);
    const gap = 2 + ((seed >>> 20) & 3);
    ctx.fillRect(x, y, Math.min(bar, w - MARGIN - x), h);
    x += bar + gap;
  }
};

const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  max: number,
  min: number,
): number => {
  for (let size = max; size > min; size -= 2) {
    ctx.font = `bold ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
  }
  return min;
};

/** 伝票の表を描く(透明な canvas に紙の形で塗る) */
export const paintSlip = (
  canvas: HTMLCanvasElement,
  content: SlipContent,
): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const {width: w, height: h} = canvas;
  paperBase(ctx, w, h);

  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText("依 頼", w / 2, 78);
  ctx.font = `14px ${MONO}`;
  ctx.fillText("* * *  ORDER SLIP  * * *", w / 2, 102);
  dashed(ctx, 118, w);

  ctx.textAlign = "left";
  ctx.font = `17px ${MONO}`;
  ctx.fillText(`No. ${content.number}`, MARGIN, 148);
  ctx.textAlign = "right";
  ctx.fillText(`PHASE ${content.phase}`, w - MARGIN, 148);
  dashed(ctx, 166, w);

  ctx.textAlign = "left";
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`タスク ${content.items.length} 件`, MARGIN, 196);

  // 項目は紙の残り(制限の行とバーコードの上)に収める。多いほど詰める
  const top = 212;
  const bottom = h - 170;
  const slot = Math.min(72, (bottom - top) / Math.max(1, content.items.length));
  const kindSize = Math.min(26, Math.round(slot * 0.36));
  const detailSize = Math.min(32, Math.round(slot * 0.42));
  content.items.forEach((item, i) => {
    const y = top + slot * i;
    ctx.font = `bold ${kindSize}px ${FONT}`;
    const label = `${i + 1}. ${item.kind}`;
    ctx.fillText(label, MARGIN, y + kindSize, w - 2 * MARGIN);
    if (item.detail !== null) {
      const size = fitFontSize(
        ctx,
        item.detail,
        w - 2 * MARGIN - 24,
        detailSize,
        14,
      );
      ctx.font = `bold ${size}px ${FONT}`;
      ctx.fillText(item.detail, MARGIN + 24, y + kindSize + 6 + size);
    }
  });

  const y = bottom + 6;
  dashed(ctx, y, w);
  ctx.font = `17px ${MONO}`;
  ctx.fillText("制限", MARGIN, y + 30);
  ctx.textAlign = "right";
  ctx.fillText(
    content.limitSeconds === null ? "--" : `${content.limitSeconds} 秒`,
    w - MARGIN,
    y + 30,
  );

  barcode(ctx, content.number, h - 118, w, 44);
  ctx.textAlign = "center";
  ctx.font = `12px ${MONO}`;
  ctx.fillText("IUBEO", w / 2, h - 56);
};

/** 伝票の裏(白い紙の形だけ) */
export const paintSlipBack = (canvas: HTMLCanvasElement): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  paperBase(ctx, canvas.width, canvas.height);
};
