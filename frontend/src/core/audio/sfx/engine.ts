import {type AudioManager, audioManager} from "../audioManager";
import {RECIPES} from "./recipes";
import {now, setContext} from "./tone";
import type {
  Emitter,
  OptionArgs,
  Recipe,
  SfxEngine,
  SfxId,
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

const FADE_SECONDS = 0.03;
const RELEASE_MS = 50;

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

  const makeVoice = (id: SfxId, out: AudioNode): AnyVoice => {
    ensureTone();
    return (recipes[id] as Recipe<SfxId>).make(out);
  };

  const emitter = (ids: readonly SfxId[], position?: Vec3): Emitter => {
    const ctx = audio.context();
    const input = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 5;
    panner.maxDistance = 40;
    panner.rolloffFactor = 1;
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
    for (const id of ids) {
      voices.set(id, makeVoice(id, input));
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
        voiceOf(id)?.play(tone.now(), options as never);
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
          input.disconnect();
          panner.disconnect();
          output.disconnect();
        }, RELEASE_MS);
      },
    };
  };

  const global = new Map<SfxId, AnyVoice>();

  const them = <Id extends SfxId>(id: Id, ...options: OptionArgs<Id>) => {
    let voice = global.get(id);
    if (!voice) {
      voice = makeVoice(id, audio.gameBus());
      global.set(id, voice);
    }
    voice.play(tone.now(), options[0] as never);
  };

  return {
    emitter,
    them,
    now: () => tone.now(),
  };
};

export const sfxEngine = createSfxEngine({
  audio: audioManager,
  recipes: RECIPES,
});
