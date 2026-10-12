import type {ComponentType} from "react";
import type {Mesh} from "three/webgpu";

import type {GameObject} from "../types";
import type {ScreenSource} from "./display/types";
import type {PcPointerMode} from "./session";

export type PcProgramProps = {
  object: GameObject;
  screen: ScreenSource;
  using: boolean;
  mine: boolean;
  screenRef: {readonly current: Mesh | null};
};

/**
 * screen は PcObject が一度だけ呼んで持ち続ける。
 * prewarm はプレイヤーが PC に近づいている間、毎フレーム呼ばれるので、何度呼ばれてもよいこと
 */
export type PcProgram = {
  pointer: PcPointerMode;
  view?: {fill: number};
  alwaysOn?: boolean;
  screen: () => ScreenSource;
  prewarm?: () => void;
  Runner: ComponentType<PcProgramProps>;
};
