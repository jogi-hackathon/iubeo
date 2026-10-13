import {type AudioManager, audioManager} from "../audioManager";
import {RECIPES} from "./recipes";
import {now, setContext} from "./tone";
import type {
  Emitter,
  OptionArgs,
  Recipe,
  SfxEngine,
  SfxId,
  Spatial,
  Vec3,
  Voice,
} from "./types";

export type SfxRecipes = {[K in SfxId]: Recipe<K>};

export type ToneApi = {
  setContext(context: AudioContext): void;
  now(): number;
};

export type SfxEngineDeps = {
  audio: Pick<AudioManager, "context" | "gameBus">;
  recipes: SfxRecipes;
  tone?: ToneApi;
};

type AnyVoice = Voice<SfxId>;
type PlayAny = (id: SfxId, options?: unknown) => void;

const DEFAULT_SPATIAL: Spatial = {ref: 5, rolloff: 1};
const FADE_SECONDS = 0.03;
const RELEASE_MS = 50;

const trimListeners = new Set<() => void>();

export const subscribeTrim = (listener: () => void) => {
  trimListeners.add(listener);
  return () => {
    trimListeners.delete(listener);
  };
};

const dbToGain = (db: number) => 10 ** (db / 20);

const setParam = (param: AudioParam, value: number, at: number) => {
  if (param.setValueAtTime) {
    param.setValueAtTime(value, at);
  } else {
    param.value = value;
  }
};

export const createSfxEngine = ({
  audio,
  recipes,
  tone = {setContext, now},
}: SfxEngineDeps): SfxEngine => {
  let toneReady = false;
  const ensureTone = () => {
    if (!toneReady) {
      tone.setContext(audio.context());
      toneReady = true;
    }
  };

  const trims = new Map<SfxId, number>();
  const trimGains = new Map<SfxId, Set<GainNode>>();

  const makeVoice = (
    id: SfxId,
    out: AudioNode,
  ): {voice: AnyVoice; release: () => void} => {
    ensureTone();
    const gain = audio.context().createGain();
    gain.gain.value = dbToGain(trims.get(id) ?? 0);
    gain.connect(out);
    let set = trimGains.get(id);
    if (!set) {
      set = new Set();
      trimGains.set(id, set);
    }
    set.add(gain);
    const voice = (recipes[id] as Recipe<SfxId>).make(gain);
    return {
      voice,
      release: () => {
        set.delete(gain);
        gain.disconnect();
      },
    };
  };

  const emitter = (
    ids: readonly SfxId[],
    position?: Vec3,
    spatial: Spatial = DEFAULT_SPATIAL,
  ): Emitter => {
    const ctx = audio.context();
    const input = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = spatial.ref;
    panner.rolloffFactor = spatial.rolloff;
    const output = ctx.createGain();
    input.connect(panner);
    panner.connect(output);
    output.connect(audio.gameBus());

    const setPosition = (pos: Vec3) => {
      const at = ctx.currentTime;
      setParam(panner.positionX, pos.x, at);
      setParam(panner.positionY, pos.y, at);
      setParam(panner.positionZ, pos.z, at);
    };
    if (position) {
      setPosition(position);
    }

    const voices = new Map<SfxId, AnyVoice>();
    const releases: (() => void)[] = [];
    for (const id of ids) {
      const made = makeVoice(id, input);
      voices.set(id, made.voice);
      releases.push(made.release);
    }

    let disposed = false;

    const voiceOf = (id: SfxId): AnyVoice | undefined => {
      const voice = voices.get(id);
      if (!voice) {
        console.warn(`[sfx] recipe not registered on emitter: ${id}`);
      }
      return voice;
    };

    return {
      setPosition,
      play: ((id: SfxId, options?: unknown) => {
        try {
          voiceOf(id)?.play(tone.now(), options as never);
        } catch (e) {
          console.warn(`[sfx] play(${id}) failed`, e);
        }
      }) as PlayAny as Emitter["play"],
      stop: (id) => {
        voiceOf(id)?.stop(tone.now());
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        const at = ctx.currentTime;
        output.gain.cancelScheduledValues(at);
        output.gain.setValueAtTime(output.gain.value, at);
        output.gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
        setTimeout(() => {
          for (const voice of voices.values()) {
            voice.dispose();
          }
          voices.clear();
          for (const release of releases) {
            release();
          }
          input.disconnect();
          panner.disconnect();
          output.disconnect();
        }, RELEASE_MS);
      },
    };
  };

  const global = new Map<SfxId, AnyVoice>();

  const them = <Id extends SfxId>(id: Id, ...options: OptionArgs<Id>) => {
    try {
      let voice = global.get(id);
      if (!voice) {
        voice = makeVoice(id, audio.gameBus()).voice;
        global.set(id, voice);
      }
      voice.play(tone.now(), options[0] as never);
    } catch (e) {
      console.warn(`[sfx] them(${id}) failed`, e);
    }
  };

  const stopThem = (id: SfxId) => {
    global.get(id)?.stop(tone.now());
  };

  const setTrim = (id: SfxId, db: number) => {
    trims.set(id, db);
    const value = dbToGain(db);
    for (const gain of trimGains.get(id) ?? []) {
      gain.gain.value = value;
    }
    for (const listener of trimListeners) {
      listener();
    }
  };

  return {
    emitter,
    them,
    stopThem,
    setTrim,
    trim: (id) => trims.get(id) ?? 0,
    now: () => tone.now(),
  };
};

export const sfxEngine = createSfxEngine({
  audio: audioManager,
  recipes: RECIPES,
});
