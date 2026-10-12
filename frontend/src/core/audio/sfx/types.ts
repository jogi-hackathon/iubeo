export type Vec3 = {x: number; y: number; z: number};

export type SfxId =
  | "pcFan"
  | "writing"
  | "shatter"
  | "key"
  | "click"
  | "swipe"
  | "step"
  | "jump"
  | "land"
  | "ignite"
  | "flame"
  | "glitch"
  | "window"
  | "filePick"
  | "save"
  | "clefOk"
  | "clefNo"
  | "canvas"
  | "slip"
  | "done"
  | "deadline"
  | "match"
  | "dive"
  | "corrupt";

export type WritingBeat = {at: number; line: number; x: number};
export type WritingLine = {height: number; shaded: boolean};

export type WritingCue = {
  beats: readonly WritingBeat[];
  lines: readonly WritingLine[];
  startIn: number;
};

export type SlipCue = {
  printSeconds: number;
  feedSeconds: number;
  tearSeconds: number;
};

export type PlayOptions = {
  pcFan: undefined;
  writing: WritingCue;
  shatter: undefined;
  key: undefined;
  click: "down" | "up";
  swipe: number;
  step: undefined;
  jump: undefined;
  land: number;
  ignite: undefined;
  flame: undefined;
  glitch: number;
  window: undefined;
  filePick: undefined;
  save: undefined;
  clefOk: undefined;
  clefNo: undefined;
  canvas: undefined;
  slip: SlipCue;
  done: undefined;
  deadline: undefined;
  match: undefined;
  dive: undefined;
  corrupt: undefined;
};

export type Voice<Id extends SfxId = SfxId> = {
  play(time: number, options: PlayOptions[Id]): void;
  stop(time: number): void;
  dispose(): void;
};

export type Recipe<Id extends SfxId = SfxId> = {
  id: Id;
  make(out: AudioNode): Voice<Id>;
};

export type Spatial = {ref: number; rolloff: number};

export type Emitter = {
  setPosition(pos: Vec3): void;
  play<Id extends SfxId>(id: Id, ...options: OptionArgs<Id>): void;
  stop(id: SfxId): void;
  dispose(): void;
};

export type OptionArgs<Id extends SfxId> = PlayOptions[Id] extends undefined
  ? []
  : [options: PlayOptions[Id]];

export type SfxEngine = {
  emitter(
    recipes: readonly SfxId[],
    position?: Vec3,
    spatial?: Spatial,
  ): Emitter;
  them<Id extends SfxId>(id: Id, ...options: OptionArgs<Id>): void;
  stopThem(id: SfxId): void;
  setTrim(id: SfxId, db: number): void;
  trim(id: SfxId): number;
  now(): number;
};
