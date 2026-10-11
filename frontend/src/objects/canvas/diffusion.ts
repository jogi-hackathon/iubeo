import {CANVAS_ACTION_MS} from "./data";

/** ノイズが紙の全面に出揃うまでの秒数(マスごとにばらばらに現れる) */
export const APPEAR_SECONDS = 0.25;
/** 描き上がった絵が、白い紙に戻りきるまでの秒数(作業が終わってから。上から順に、白へ消えていく) */
export const VANISH_SECONDS = 0.4;
/** 描き上がってから、作業が終わる(結果が反映される)までに残す秒数 */
const FINISH_HOLD_SECONDS = 0.15;

const DENOISE_START = APPEAR_SECONDS;
const DENOISE_SECONDS =
  CANVAS_ACTION_MS / 1000 - APPEAR_SECONDS - FINISH_HOLD_SECONDS;

/**
 * 作業を始めてからの経過秒数 → ノイズを取り除いた度合い(0: ノイズだけ、1: 描き上がり)。
 * ノイズが出揃ってから、作業が終わる少し前までで 0→1 にする(段階に刻むのはシェーダー側。diffusionMaterial)
 */
export const denoiseProgress = (elapsed: number): number =>
  Math.min(1, Math.max(0, (elapsed - DENOISE_START) / DENOISE_SECONDS));

/**
 * ノイズが出ているマスの割合(0: 真っ白な紙、1: 全マス)を、1 フレーム進める。作業中だけ APPEAR_SECONDS で 1 へ進む
 * (作業が終わっても戻さない。白へ戻すのは fade。作業を始めるときに 0 へ戻す)
 */
export const stepAppear = (
  appear: number,
  working: boolean,
  dt: number,
): number => (working ? Math.min(1, appear + dt / APPEAR_SECONDS) : appear);

/**
 * 演出が残っている高さ(1: 全面、0: 真っ白な紙)を、1 フレーム進める。
 * 作業中は 1 のまま、作業が終わったら VANISH_SECONDS で 0 へ下げる(描き上がった絵が、上から順に白へ消えていく)
 */
export const stepFade = (fade: number, working: boolean, dt: number): number =>
  working ? 1 : Math.max(0, fade - dt / VANISH_SECONDS);
