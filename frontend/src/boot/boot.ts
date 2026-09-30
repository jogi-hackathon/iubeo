import {loadGraphicsSettings} from "../core/graphics";
import {loadAssets} from "./assets";
import {assertWebGPUAvailable} from "./capabilities";
import type {AppContext} from "./context";
import {prepareData} from "./data";

export interface BootProgress {
  /** 実行中のステップの表示名 */
  step: string;
  /** 0 始まりのステップ番号 */
  index: number;
  total: number;
}

export interface BootStep {
  name: string;
  run: (draft: Partial<AppContext>) => Promise<void> | void;
}

/** 起動シーケンス。上から順に実行される(各モジュールは自己登録せず、ここに明示的に列挙する) */
export const BOOT_STEPS: BootStep[] = [
  {
    name: "settings",
    run: (d) => {
      d.settings = loadGraphicsSettings();
    },
  },
  {
    name: "webgpu",
    run: () => assertWebGPUAvailable(),
  },
  {
    name: "assets",
    run: async (d) => {
      d.assets = await loadAssets();
    },
  },
  {name: "data", run: () => prepareData()},
];

export const runSteps = async (
  steps: readonly BootStep[],
  onProgress: (p: BootProgress) => void,
): Promise<AppContext> => {
  const draft: Partial<AppContext> = {};
  for (const [index, {name, run}] of steps.entries()) {
    onProgress({step: name, index, total: steps.length});
    await run(draft);
  }
  const {settings, assets} = draft;
  if (!settings || !assets) {
    throw new Error("boot: AppContext が揃わないまま終了しました");
  }
  return {settings, assets};
};

export const boot = (
  onProgress: (p: BootProgress) => void,
): Promise<AppContext> => runSteps(BOOT_STEPS, onProgress);
