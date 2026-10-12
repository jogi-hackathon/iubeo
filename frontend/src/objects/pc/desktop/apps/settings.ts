import type {
  AudioDevice,
  AudioDeviceList,
} from "../../../../core/audio/devices";
import {
  type AudioSettings,
  MAX_GAME_VOLUME,
  MAX_MIC_VOLUME,
  MAX_VOICE_VOLUME,
} from "../../../../core/audioSettings";
import {
  FPS_LIMIT_CHOICES,
  type GraphicsSettings,
  RESOLUTION_SCALE_CHOICES,
} from "../../../../core/graphics";
import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  type MouseSettings,
} from "../../../../core/input/mouseSettings";
import type {AppView, DesktopApp, LaunchOptions} from "../kernel/app";
import type {Rect, Size} from "../kernel/geometry";
import {
  paintButton,
  paintDropdown,
  paintDropdownList,
  paintGroup,
  paintLevelMeter,
  paintSlider,
  paintTabs,
} from "../paint/controls";
import {COLORS, FONT} from "../theme/classic";
import {
  type Choice,
  type Control,
  createButton,
  createControlSet,
  createDropdown,
  createSlider,
  createTabs,
  type Dropdown,
  type Slider,
} from "../toolkit/controls";

export type SettingsPort<T> = {
  getState(): Readonly<T>;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
};

export type MouseSettingsPort = SettingsPort<MouseSettings>;

export type AudioDevicePort = {
  getState(): AudioDeviceList;
  refresh(): void;
  requestPermission(): void;
  subscribe(listener: () => void): () => void;
};

export type MicMeterPort = {
  start(): () => void;
  level(): number;
};

type FrameSchedule = (fn: () => void) => () => void;

const defaultFrames: FrameSchedule = (fn) => {
  let id = 0;
  const loop = () => {
    fn();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
};

export type SettingsPorts = {
  mouse: MouseSettingsPort;
  graphics: SettingsPort<GraphicsSettings>;
  audio: SettingsPort<AudioSettings>;
  devices: AudioDevicePort;
  micMeter: MicMeterPort;
};

type Draft = {
  mouse: MouseSettings;
  graphics: GraphicsSettings;
  audio: AudioSettings;
};

const SIZE: Size = {width: 340, height: 400};
const SENSITIVITY_STEP = 0.1;
const VOLUME_STEP = 0.05;
const DEFAULT_SENSITIVITY = 1;
const TAB_LABELS = ["マウス", "画面", "サウンド"] as const;
export const SETTINGS_TAB = {mouse: 0, graphics: 1, sound: 2} as const;

const BUTTON = {y: SIZE.height - 31, width: 75, height: 23};
const VOLUME_GROUP_HEIGHT = 100;
const METER_ROW_HEIGHT = 24;
const GAME_ROW_HEIGHT = 40;
const METER_FRAME_STRIDE = 2;
const METER_SEGMENTS = 28;

const volumeRows = (top: number, extra = 0) => ({
  group: {x: 16, y: top, width: 308, height: VOLUME_GROUP_HEIGHT + extra},
  device: {x: 90, y: top + 18, width: 220, height: 21},
  meter: {x: 90, y: top + 48, width: 220, height: 12},
  volume: {x: 30, y: top + 66 + extra, width: 280, height: 30},
});

export const SETTINGS_LAYOUT = {
  tabs: {x: 8, y: 8, width: 324, height: 18},
  panel: {x: 6, y: 25, width: 328, height: 332},
  ok: {x: SIZE.width - 8 - BUTTON.width * 3 - 12, ...BUTTON},
  cancel: {x: SIZE.width - 8 - BUTTON.width * 2 - 6, ...BUTTON},
  apply: {x: SIZE.width - 8 - BUTTON.width, ...BUTTON},
  mouse: {
    group: {x: 16, y: 36, width: 308, height: 104},
    slider: {x: 30, y: 78, width: 280, height: 30},
    reset: {x: 234, y: 150, width: 90, height: 23},
  },
  graphics: {
    group: {x: 16, y: 36, width: 308, height: 96},
    resolution: {x: 166, y: 54, width: 144, height: 21},
    fps: {x: 166, y: 86, width: 144, height: 21},
  },
  speaker: {
    ...volumeRows(36, GAME_ROW_HEIGHT),
    game: {x: 30, y: 36 + 66, width: 280, height: 30},
  },
  mic: volumeRows(
    36 + VOLUME_GROUP_HEIGHT + GAME_ROW_HEIGHT + 8,
    METER_ROW_HEIGHT,
  ),
  loadDevices: {x: 194, y: 320, width: 130, height: 23},
} as const satisfies Record<string, Rect | Record<string, Rect>>;

const TAB_WIDTHS = [56, 48, 64];

const RESOLUTION_CHOICES: readonly Choice<number>[] =
  RESOLUTION_SCALE_CHOICES.map((scale) => ({
    value: scale,
    label: `${Math.round(scale * 100)}%`,
  }));

const FPS_CHOICES: readonly Choice<number | null>[] = FPS_LIMIT_CHOICES.map(
  (fps) => ({value: fps, label: fps === null ? "上限なし" : `${fps} fps`}),
);

const withCurrent = <T>(
  choices: readonly Choice<T>[],
  current: T,
  label: (value: T) => string,
): readonly Choice<T>[] =>
  choices.some((c) => Object.is(c.value, current))
    ? choices
    : [...choices, {value: current, label: label(current)}];

const deviceChoices = (
  devices: readonly AudioDevice[],
  current: string | null,
): readonly Choice<string | null>[] =>
  withCurrent(
    [
      {value: null, label: "既定のデバイス"},
      ...devices.map((d) => ({value: d.id, label: d.label})),
    ],
    current,
    () => "(つながっていないデバイス)",
  );

const percent = (value: number) => `${Math.round(value * 100)}%`;

const text = (
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  align: "left" | "right",
) => {
  ctx.font = FONT;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
};

/**
 * 設定の窓(マウス・画面・サウンド)。窓の中で変えた値は下書きに持ち、「適用」か「OK」で保存して反映する。
 * 「キャンセル」と × は下書きを捨てる
 */
export const createSettingsApp = (
  {mouse, graphics, audio, devices, micMeter}: SettingsPorts,
  frames: FrameSchedule = defaultFrames,
): DesktopApp => ({
  id: "settings",
  title: "設定",
  icon: "settings",
  size: SIZE,
  open: (context, options?: LaunchOptions): AppView => {
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const l of Array.from(listeners)) {
        l();
      }
    };

    const saved = (): Draft => ({
      mouse: {...mouse.getState()},
      graphics: {...graphics.getState()},
      audio: {...audio.getState()},
    });
    let draft = saved();
    const touched = new Set<keyof Draft>();
    const tabIndex = (name: string | undefined): number | undefined =>
      name !== undefined && Object.hasOwn(SETTINGS_TAB, name)
        ? SETTINGS_TAB[name as keyof typeof SETTINGS_TAB]
        : undefined;
    let tab: number = tabIndex(options?.tab) ?? SETTINGS_TAB.mouse;

    let away = false;
    let stopMeter: (() => void) | null = null;
    let stopFrames: (() => void) | null = null;
    let shownLevel = 0;
    const syncMeter = (disposed = false) => {
      const wanted =
        !disposed &&
        !away &&
        tab === SETTINGS_TAB.sound &&
        !devices.getState().needsPermission;
      if (wanted && !stopMeter) {
        shownLevel = 0;
        stopMeter = micMeter.start();
        let frame = 0;
        stopFrames = frames(() => {
          frame += 1;
          if (frame % METER_FRAME_STRIDE !== 0) {
            return;
          }
          const next = Math.max(
            Math.ceil(micMeter.level() * METER_SEGMENTS),
            shownLevel - 1,
          );
          if (next !== shownLevel) {
            shownLevel = next;
            notify();
          }
        });
      } else if (!wanted && stopMeter) {
        stopFrames?.();
        stopMeter();
        stopFrames = null;
        stopMeter = null;
        shownLevel = 0;
      }
    };
    const selectTab = (index: number) => {
      tab = index;
      if (index === SETTINGS_TAB.sound) {
        devices.refresh();
      }
      syncMeter();
    };

    const edit = <K extends keyof Draft>(key: K, patch: Partial<Draft[K]>) => {
      draft = {...draft, [key]: {...draft[key], ...patch}};
      touched.add(key);
    };
    const dirty = () => {
      const current = saved();
      return Array.from(touched).some(
        (key) => JSON.stringify(draft[key]) !== JSON.stringify(current[key]),
      );
    };
    const apply = () => {
      const current = saved();
      const changed = (key: keyof Draft) =>
        touched.has(key) &&
        JSON.stringify(draft[key]) !== JSON.stringify(current[key]);
      if (changed("mouse")) {
        mouse.set(draft.mouse);
      }
      if (changed("graphics")) {
        graphics.set(draft.graphics);
      }
      if (changed("audio")) {
        audio.set(draft.audio);
      }
    };

    const tabs = createTabs({
      rect: SETTINGS_LAYOUT.tabs,
      widths: TAB_WIDTHS,
      selected: () => tab,
      onSelect: selectTab,
    });
    const ok = createButton({
      rect: SETTINGS_LAYOUT.ok,
      onClick: () => {
        apply();
        context.close();
      },
    });
    const cancel = createButton({
      rect: SETTINGS_LAYOUT.cancel,
      onClick: () => context.close(),
    });
    const applyButton = createButton({
      rect: SETTINGS_LAYOUT.apply,
      enabled: dirty,
      onClick: apply,
    });

    const sensitivity = createSlider({
      rect: SETTINGS_LAYOUT.mouse.slider,
      min: MIN_SENSITIVITY,
      max: MAX_SENSITIVITY,
      step: SENSITIVITY_STEP,
      value: () => draft.mouse.sensitivity,
      onChange: (value) => edit("mouse", {sensitivity: value}),
    });
    const resetMouse = createButton({
      rect: SETTINGS_LAYOUT.mouse.reset,
      enabled: () => draft.mouse.sensitivity !== DEFAULT_SENSITIVITY,
      onClick: () => edit("mouse", {sensitivity: DEFAULT_SENSITIVITY}),
    });

    const resolution = createDropdown({
      rect: SETTINGS_LAYOUT.graphics.resolution,
      bottomLimit: SIZE.height,
      choices: () =>
        withCurrent(
          RESOLUTION_CHOICES,
          draft.graphics.resolutionScale,
          percent,
        ),
      value: () => draft.graphics.resolutionScale,
      onChange: (value) => edit("graphics", {resolutionScale: value}),
    });
    const fps = createDropdown<number | null>({
      rect: SETTINGS_LAYOUT.graphics.fps,
      bottomLimit: SIZE.height,
      choices: () =>
        withCurrent(FPS_CHOICES, draft.graphics.fpsLimit, (v) => `${v} fps`),
      value: () => draft.graphics.fpsLimit,
      onChange: (value) => edit("graphics", {fpsLimit: value}),
    });

    const output = createDropdown<string | null>({
      rect: SETTINGS_LAYOUT.speaker.device,
      bottomLimit: SIZE.height,
      enabled: () => devices.getState().canSelectOutput,
      choices: () =>
        deviceChoices(devices.getState().outputs, draft.audio.outputDeviceId),
      value: () => draft.audio.outputDeviceId,
      onChange: (value) => edit("audio", {outputDeviceId: value}),
    });
    const gameVolume = createSlider({
      rect: SETTINGS_LAYOUT.speaker.game,
      min: 0,
      max: MAX_GAME_VOLUME,
      step: VOLUME_STEP,
      value: () => draft.audio.gameVolume,
      onChange: (value) => edit("audio", {gameVolume: value}),
    });
    const voiceVolume = createSlider({
      rect: SETTINGS_LAYOUT.speaker.volume,
      min: 0,
      max: MAX_VOICE_VOLUME,
      step: VOLUME_STEP,
      value: () => draft.audio.voiceVolume,
      onChange: (value) => edit("audio", {voiceVolume: value}),
    });
    const input = createDropdown<string | null>({
      rect: SETTINGS_LAYOUT.mic.device,
      bottomLimit: SIZE.height,
      choices: () =>
        deviceChoices(devices.getState().inputs, draft.audio.inputDeviceId),
      value: () => draft.audio.inputDeviceId,
      onChange: (value) => edit("audio", {inputDeviceId: value}),
    });
    const loadDevices = createButton({
      rect: SETTINGS_LAYOUT.loadDevices,
      enabled: () => devices.getState().needsPermission,
      onClick: () => devices.requestPermission(),
    });
    const micVolume = createSlider({
      rect: SETTINGS_LAYOUT.mic.volume,
      min: 0,
      max: MAX_MIC_VOLUME,
      step: VOLUME_STEP,
      value: () => draft.audio.micVolume,
      onChange: (value) => edit("audio", {micVolume: value}),
    });

    const pages: readonly (readonly Control[])[] = [
      [sensitivity, resetMouse],
      [resolution, fps],
      [output, gameVolume, voiceVolume, input, micVolume, loadDevices],
    ];
    const pageDropdowns: readonly (readonly Dropdown<unknown>[])[] = [
      [],
      [resolution, fps],
      [output, input],
    ];
    const controls = createControlSet(() => [
      ...pageDropdowns[tab]!,
      tabs,
      ok,
      cancel,
      applyButton,
      ...pages[tab]!,
    ]);

    const offs = [
      mouse.subscribe(notify),
      graphics.subscribe(notify),
      audio.subscribe(notify),
      devices.subscribe(() => {
        syncMeter();
        notify();
      }),
    ];
    devices.refresh();
    syncMeter();

    const paintVolume = (
      ctx: CanvasRenderingContext2D,
      title: string,
      rows: ReturnType<typeof volumeRows>,
      device: Dropdown<string | null>,
      slider: Slider,
      label: string,
      meter = false,
    ) => {
      const {group} = rows;
      paintGroup(ctx, group, title);
      text(ctx, "デバイス", group.x + 14, rows.device.y + 11, "left");
      paintDropdown(ctx, device);
      if (meter) {
        text(ctx, "入力レベル", group.x + 14, rows.meter.y + 7, "left");
        paintLevelMeter(ctx, rows.meter, METER_SEGMENTS, shownLevel);
      }
      text(ctx, label, group.x + 14, rows.volume.y - 10, "left");
      text(
        ctx,
        percent(slider.value()),
        group.x + group.width - 14,
        rows.volume.y - 10,
        "right",
      );
      paintSlider(ctx, slider, 10);
    };

    const paintMouse = (ctx: CanvasRenderingContext2D) => {
      const {group, slider} = SETTINGS_LAYOUT.mouse;
      paintGroup(ctx, group, "マウス");
      text(ctx, "マウスの速さ", group.x + 14, group.y + 26, "left");
      text(
        ctx,
        `× ${draft.mouse.sensitivity.toFixed(1)}`,
        group.x + group.width - 14,
        group.y + 26,
        "right",
      );
      paintSlider(ctx, sensitivity, 14);
      text(ctx, "遅い", slider.x, slider.y + 38, "left");
      text(ctx, "速い", slider.x + slider.width, slider.y + 38, "right");
      paintButton(ctx, resetMouse, "既定に戻す");
    };

    const paintGraphics = (ctx: CanvasRenderingContext2D) => {
      const {group, resolution: res, fps: fr} = SETTINGS_LAYOUT.graphics;
      paintGroup(ctx, group, "画面");
      text(ctx, "解像度", group.x + 14, res.y + 11, "left");
      paintDropdown(ctx, resolution);
      text(ctx, "フレームレートの上限", group.x + 14, fr.y + 11, "left");
      paintDropdown(ctx, fps);
      ctx.fillStyle = COLORS.grayText;
      ctx.fillText(
        "解像度を下げると軽くなります。",
        group.x + 4,
        group.y + group.height + 14,
      );
    };

    const paintSound = (ctx: CanvasRenderingContext2D) => {
      const {game} = SETTINGS_LAYOUT.speaker;
      const speakerGroup = SETTINGS_LAYOUT.speaker.group;
      paintVolume(
        ctx,
        "スピーカー",
        SETTINGS_LAYOUT.speaker,
        output,
        voiceVolume,
        "ボイスチャットの音量",
      );
      text(ctx, "ゲームの音量", speakerGroup.x + 14, game.y - 10, "left");
      text(
        ctx,
        percent(gameVolume.value()),
        speakerGroup.x + speakerGroup.width - 14,
        game.y - 10,
        "right",
      );
      paintSlider(ctx, gameVolume, 10);
      paintVolume(
        ctx,
        "マイク",
        SETTINGS_LAYOUT.mic,
        input,
        micVolume,
        "マイクの音量",
        true,
      );
      paintButton(ctx, loadDevices, "デバイスを読み込む");
    };

    return {
      paint: (ctx) => {
        paintTabs(ctx, tabs, TAB_LABELS, SETTINGS_LAYOUT.panel);
        [paintMouse, paintGraphics, paintSound][tab]!(ctx);
        paintButton(ctx, ok, "OK", {isDefault: true});
        paintButton(ctx, cancel, "キャンセル");
        paintButton(ctx, applyButton, "適用");
        for (const dropdown of pageDropdowns[tab]!) {
          paintDropdownList(ctx, dropdown);
        }
      },
      pointer: (event) => {
        if (away) {
          away = false;
          syncMeter();
        }
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
      reveal: (next) => {
        away = false;
        const index = tabIndex(next.tab);
        if (index !== undefined) {
          selectTab(index);
        } else {
          syncMeter();
        }
        notify();
      },
      cancel: () => {
        controls.cancel();
        away = true;
        syncMeter();
        notify();
      },
      dispose: () => {
        syncMeter(true);
        for (const off of offs) {
          off();
        }
        listeners.clear();
      },
    };
  },
});
