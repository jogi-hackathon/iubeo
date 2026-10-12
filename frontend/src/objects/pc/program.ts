import type {ComponentType} from "react";
import type {Mesh} from "three/webgpu";

import type {GameObject} from "../types";
import type {ScreenSource} from "./display/types";

export type PcProgramProps = {
  object: GameObject;
  screen: ScreenSource;
  /** この PC を使っている(カメラが画面の前にあり、入力が画面へ向く) */
  using: boolean;
  /** pcSession がこの PC のもの(使っている途中、または離れる補間の途中) */
  mine: boolean;
  screenRef: {readonly current: Mesh | null};
};

/**
 * PC の中で動くもの。PcObject はモデル・CRT・カメラの寄り・セッションだけを持ち、
 * 画面に何を出して入力をどう扱うかはここに任せる
 *
 * - screen: 画面のソース。PcObject が一度だけ呼んで持ち続ける
 * - prewarm: プレイヤーが PC に近づいている間、毎フレーム呼ぶ(重い読み込みを先に始めるため。何度呼ばれてもよいこと)
 * - Runner: PcObject の配下(PC の座標系)に置くコンポーネント。入力・判定などのフックを持ち、PC に付く小物(お題のメモなど)を描いてよい
 */
export type PcProgram = {
  screen: () => ScreenSource;
  prewarm?: () => void;
  Runner: ComponentType<PcProgramProps>;
};
