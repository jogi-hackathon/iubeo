export type Vec3 = {x: number; y: number; z: number};

export type SfxId = "pcFan" | "writing" | "shatter";

export type WritingBeat = {at: number; line: number; x: number};
export type WritingLine = {height: number; shaded: boolean};

export type WritingCue = {
  beats: readonly WritingBeat[];
  lines: readonly WritingLine[];
  startIn: number;
};

export type PlayOptions = {
  pcFan: undefined;
  writing: WritingCue;
  shatter: undefined;
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
  emitter(recipes: readonly SfxId[], position?: Vec3): Emitter;
  them<Id extends SfxId>(id: Id, ...options: OptionArgs<Id>): void;
  now(): number;
};
