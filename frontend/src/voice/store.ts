import {useSyncExternalStore} from "react";
import {Vector3, type Camera} from "three";

import {createPlayerState, playerManager} from "../player";
import type {PlayerState} from "../player";
import {createVoiceAudio, type VoiceAudio} from "./audio";
import {MoqVoice} from "./moq";
import {Signaling} from "./signaling";

const tmpForward = new Vector3();

export type VoiceStatus = "idle" | "connecting" | "ready" | "unavailable";

export type VoiceState = {
  status: VoiceStatus;
  /** 使えないときの理由（コンソールと、必要なら画面に出す） */
  detail?: string;
  /** push-to-talk を押していて、実際に送っている */
  transmitting: boolean;
  /** ミュート（押しても送らない） */
  muted: boolean;
  /** マイクの取得が済んでいる */
  micReady: boolean;
};

type VoiceToken = {
  token: string;
  room: string;
  signalingUrl: string;
  mediaUrl: string;
  expiresAt: string;
};

const IDLE: VoiceState = {
  status: "idle",
  transmitting: false,
  muted: false,
  micReady: false,
};

const fetchVoiceToken = async (): Promise<VoiceToken> => {
  const res = await fetch("/api/v1/voice/token", {credentials: "same-origin"});
  if (!res.ok) {
    throw new Error(`voice token: HTTP ${res.status}`);
  }
  return (await res.json()) as VoiceToken;
};

export const createVoiceEngine = () => {
  // state は変更のたびに新しいオブジェクトにする（useSyncExternalStore の参照同一性のため）
  let state: VoiceState = IDLE;
  const listeners = new Set<() => void>();

  let sessionId: string | null = null;
  let myPlayerId: string | null = null;
  let audio: VoiceAudio | null = null;
  let signaling: Signaling | null = null;
  let moq: MoqVoice | null = null;
  let ptt = false;
  let muted = false;
  let micStarting: Promise<void> | null = null;
  let generation = 0;

  const roster = new Set<string>();
  const decoders = new Map<string, AudioDecoder>();
  const scratch = new Map<string, PlayerState>();

  const set = (patch: Partial<VoiceState>) => {
    state = {...state, ...patch};
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const transmitting = () => ptt && !muted;

  const playOpus = (peer: string, opus: Uint8Array) => {
    if (!audio) {
      return;
    }
    let dec = decoders.get(peer);
    if (!dec) {
      dec = new AudioDecoder({
        output: (data) => {
          const frames = data.numberOfFrames;
          const pcm = new Float32Array(frames);
          data.copyTo(pcm, {planeIndex: 0, format: "f32-planar"});
          data.close();
          audio?.feed(peer, pcm);
        },
        error: () => {
          /* 壊れたフレームは捨てる */
        },
      });
      dec.configure({codec: "opus", sampleRate: 48000, numberOfChannels: 1});
      decoders.set(peer, dec);
    }
    try {
      dec.decode(
        new EncodedAudioChunk({
          type: "key",
          timestamp: performance.now() * 1000,
          data: opus,
        }),
      );
    } catch {
      /* 閉じた */
    }
  };

  const ensureMic = (): void => {
    if (!audio || audio.hasMic() || micStarting) {
      return;
    }
    micStarting = audio
      .startMic((pcm) => moq?.publishPcm(pcm, transmitting()))
      .then(() => set({micReady: true, transmitting: transmitting()}))
      .catch((e: unknown) => {
        console.warn("[voice] mic unavailable", e);
        micStarting = null;
        ptt = false;
        set({micReady: false, transmitting: false});
      });
  };

  const stop = () => {
    generation += 1;
    signaling?.close();
    moq?.close();
    for (const d of decoders.values()) {
      try {
        d.close();
      } catch {
        /* ignore */
      }
    }
    decoders.clear();
    roster.clear();
    scratch.clear();
    audio?.close();
    signaling = null;
    moq = null;
    audio = null;
    micStarting = null;
    ptt = false;
    sessionId = null;
    myPlayerId = null;
    set({...IDLE, muted});
  };

  const start = async (session: string, playerId: string): Promise<void> => {
    if (
      sessionId === session &&
      state.status !== "idle" &&
      state.status !== "unavailable"
    ) {
      return;
    }
    stop();
    sessionId = session;
    myPlayerId = playerId;
    const mine = generation;
    muted = state.muted;
    set({status: "connecting", detail: undefined, transmitting: false});

    try {
      const token = await fetchVoiceToken();
      if (mine !== generation) {
        return;
      }
      audio = createVoiceAudio();
      // 実際に音を出すのはユーザー操作の後。ここでは作るだけ
      moq = new MoqVoice();
      await moq.start({
        url: token.mediaUrl,
        token: token.token,
        room: token.room,
        id: playerId,
        onPeerAudio: playOpus,
        onError: (message) => console.warn("[voice]", message),
      });
      if (mine !== generation) {
        return;
      }

      signaling = new Signaling(
        `${token.signalingUrl}?token=${encodeURIComponent(token.token)}`,
      );
      signaling.onMsg = (m) => {
        const engineMoq = moq;
        switch (m.type) {
          case "peers":
            for (const p of m.peers) {
              if (p.id !== myPlayerId) {
                roster.add(p.id);
                engineMoq?.handlePeerJoined(p.id);
              }
            }
            break;
          case "peer-joined":
            if (m.id !== myPlayerId) {
              roster.add(m.id);
              engineMoq?.handlePeerJoined(m.id);
            }
            break;
          case "peer-left":
            roster.delete(m.id);
            engineMoq?.handlePeerLeft(m.id);
            audio?.removePeer(m.id);
            decoders.get(m.id)?.close();
            decoders.delete(m.id);
            break;
          default:
            break;
        }
      };
      await signaling.ready;
      if (mine !== generation) {
        return;
      }
      set({status: "ready"});
    } catch (e) {
      console.warn("[voice] start failed", e);
      stop();
      set({
        status: "unavailable",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const vectorOf = (v: Vector3) => ({x: v.x, y: v.y, z: v.z});

  return {
    getState: (): VoiceState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    stop,

    /** クリックやキー入力の中で呼ぶ。自動再生の制限を解く */
    unlock: (): void => {
      void audio?.resume();
    },

    setPTT: (on: boolean): void => {
      ptt = on;
      if (on) {
        ensureMic();
        void audio?.resume();
      }
      set({transmitting: transmitting()});
    },

    toggleMute: (): void => {
      muted = !muted;
      set({muted, transmitting: transmitting()});
    },

    /** 毎フレーム呼ぶ。カメラを聞き手にして、roster に居る人の声をその位置へ置く */
    updateFrame: (camera: Camera, now: number): void => {
      if (!audio || !myPlayerId) {
        return;
      }
      const forward = camera.getWorldDirection(tmpForward);
      const e = camera.matrixWorld.elements;
      const up = {x: e[4]!, y: e[5]!, z: e[6]!};
      audio.setListener(vectorOf(camera.position), vectorOf(forward), up);
      for (const p of playerManager.getState().players) {
        if (p.playerId === myPlayerId || !roster.has(p.playerId)) {
          continue;
        }
        let s = scratch.get(p.playerId);
        if (!s) {
          s = createPlayerState(0, 0, 0);
          scratch.set(p.playerId, s);
        }
        if (playerManager.sample(p.playerId, now, s)) {
          audio.setPeerPosition(p.playerId, vectorOf(s.position));
        }
      }
    },
  };
};

export type VoiceEngine = ReturnType<typeof createVoiceEngine>;

/** アプリ全体で 1 つの VC */
export const voiceEngine = createVoiceEngine();

export const useVoiceState = (): VoiceState =>
  useSyncExternalStore(voiceEngine.subscribe, voiceEngine.getState);
