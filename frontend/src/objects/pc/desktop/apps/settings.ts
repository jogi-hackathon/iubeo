import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  type MouseSettings,
} from "../../../../core/input/mouseSettings";
import type {AppView, DesktopApp} from "../kernel/app";
import type {Rect, Size} from "../kernel/geometry";
import {paintButton, paintGroup, paintSlider} from "../paint/controls";
import {COLORS, FONT} from "../theme/classic";
import {
  createButton,
  createControlSet,
  createSlider,
} from "../toolkit/controls";

/** 設定のアプリが使う、マウスの設定の口(core/input/mouseSettings の store) */
export type MouseSettingsPort = {
  getState(): Readonly<MouseSettings>;
  set(next: MouseSettings): void;
  subscribe(listener: () => void): () => void;
};

const SIZE: Size = {width: 300, height: 150};
const STEP = 0.1;
const DEFAULT_SENSITIVITY = 1;

export const SETTINGS_LAYOUT = {
  group: {x: 10, y: 8, width: SIZE.width - 20, height: 98},
  slider: {x: 24, y: 50, width: SIZE.width - 48, height: 30},
  reset: {x: SIZE.width - 186, y: SIZE.height - 33, width: 90, height: 23},
  ok: {x: SIZE.width - 90, y: SIZE.height - 33, width: 80, height: 23},
} as const satisfies Record<string, Rect>;

/**
 * 設定の窓。今はマウスの感度(一人称で見回す速さ)だけ。動かしたらすぐ効かせて保存する
 */
export const createSettingsApp = ({
  mouse,
}: {
  mouse: MouseSettingsPort;
}): DesktopApp => ({
  id: "settings",
  title: "設定",
  icon: "settings",
  size: SIZE,
  open: (context): AppView => {
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const l of Array.from(listeners)) {
        l();
      }
    };

    const sensitivity = () => mouse.getState().sensitivity;
    const setSensitivity = (value: number) =>
      mouse.set({...mouse.getState(), sensitivity: value});

    const slider = createSlider({
      rect: SETTINGS_LAYOUT.slider,
      min: MIN_SENSITIVITY,
      max: MAX_SENSITIVITY,
      step: STEP,
      value: sensitivity,
      onChange: setSensitivity,
    });
    const reset = createButton({
      rect: SETTINGS_LAYOUT.reset,
      enabled: () => sensitivity() !== DEFAULT_SENSITIVITY,
      onClick: () => setSensitivity(DEFAULT_SENSITIVITY),
    });
    const ok = createButton({
      rect: SETTINGS_LAYOUT.ok,
      onClick: () => context.close(),
    });
    const controls = createControlSet([slider, reset, ok]);
    const offMouse = mouse.subscribe(notify);

    return {
      paint: (ctx) => {
        const {group, slider: sr} = SETTINGS_LAYOUT;
        paintGroup(ctx, group, "マウス");
        ctx.font = FONT;
        ctx.fillStyle = COLORS.text;
        ctx.fillText("見回す速さ", group.x + 14, group.y + 26);
        ctx.textAlign = "right";
        ctx.fillText(
          `× ${sensitivity().toFixed(1)}`,
          group.x + group.width - 14,
          group.y + 26,
        );
        ctx.textAlign = "left";
        paintSlider(ctx, slider, 14);
        ctx.font = FONT;
        ctx.fillStyle = COLORS.text;
        ctx.fillText("遅い", sr.x, sr.y + 38);
        ctx.textAlign = "right";
        ctx.fillText("速い", sr.x + sr.width, sr.y + 38);
        ctx.textAlign = "left";
        paintButton(ctx, reset, "既定に戻す");
        paintButton(ctx, ok, "OK", {isDefault: true});
      },
      pointer: (event) => {
        if (controls.pointer(event)) {
          notify();
        }
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      cancel: () => {
        controls.cancel();
        notify();
      },
      dispose: () => {
        offMouse();
        listeners.clear();
      },
    };
  },
});
