import {useSyncExternalStore} from "react";
import {Vector3, type Camera} from "three";

import {audioSettingsStore} from "../core/audioSettings";
import {isEliminated, subscribeSpectate} from "../core/spectate";
import {createPlayerState, playerManager} from "../player";
import type {PlayerState} from "../player";
import {createVoiceAudio, type VoiceAudio} from "./audio";
import {audioDevices} from "./devices";
import {MoqVoice} from "./moq";
import {Signaling} from "./signaling";

const tmpForward = new Vector3();

export type VoiceStatus = "idle" | "connecting" | "ready" | "unavailable";

export type VoiceState = {
  status: VoiceStatus;
  detail?: string;
  transmitting: boolean;
  muted: boolean;
  micReady: boolean;
};

type VoiceToken = {
  available: true;
  token: string;
  room: string;
  signalingUrl: string;
  mediaUrl: string;
  expiresAt: string;
};

type VoiceUnavailable = {available: false; reason?: string};

const IDLE: VoiceState = {
  status: "idle",
  transmitting: false,
  muted: false,
  micReady: false,
};

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
// 続けてこれだけ失敗したら諦めて unavailable にする
const MAX_FAILURES = 8;
// これより長く繋がっていたら、失敗の回数を数え直す
const STABLE_MS = 30_000;

const fetchVoiceToken = async (): Promise<VoiceToken | null> => {
  const res = await fetch("/api/v1/voice/token", {credentials: "same-origin"});
  if (!res.ok) {
    throw new Error(`voice token: HTTP ${res.status}`);
  }
  const body = (await res.json()) as VoiceToken | VoiceUnavailable;
  return body.available ? body : null;
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
  let muted = false;
  let micStarting: Promise<void> | null = null;
  let generation = 0;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let unwatchLife: (() => void) | undefined;

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

  // 常時送信。マイクが取れていて、ミュートされておらず、脱落していないときだけ送る
  const transmitting = () => state.micReady && !muted && !isEliminated();

  // 脱落したプレイヤーの声は鳴らさない
  const isSilenced = (peer: string) =>
    playerManager.getState().players.find((p) => p.playerId === peer)?.life ===
    "eliminated";

  const closeDecoder = (peer: string) => {
    try {
      decoders.get(peer)?.close();
    } catch {}
    decoders.delete(peer);
  };

  const playOpus = (peer: string, opus: Uint8Array) => {
    if (!audio || isSilenced(peer)) {
      return;
    }
    let dec = decoders.get(peer);
    if (!dec) {
      const created = new AudioDecoder({
        output: (data) => {
          const frames = data.numberOfFrames;
          const pcm = new Float32Array(frames);
          data.copyTo(pcm, {planeIndex: 0, format: "f32-planar"});
          data.close();
          audio?.feed(peer, pcm);
        },
        // エラーで閉じたデコーダは使えないので捨て、次のフレームで作り直す
        error: () => {
          if (decoders.get(peer) === created) {
            decoders.delete(peer);
          }
        },
      });
      created.configure({
        codec: "opus",
        sampleRate: 48000,
        numberOfChannels: 1,
      });
      dec = created;
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
      closeDecoder(peer);
    }
  };

  const ensureMic = (): void => {
    if (!audio || audio.hasMic() || micStarting) {
      return;
    }
    micStarting = audio
      .startMic((pcm) => moq?.publishPcm(pcm, transmitting()))
      .then(() => {
        audioDevices.refresh();
        state = {...state, micReady: true};
        set({transmitting: transmitting()});
      })
      .catch((e: unknown) => {
        console.warn("[voice] mic unavailable", e);
        micStarting = null;
        set({micReady: false, transmitting: false});
      });
  };

  // signaling と MoQ だけを畳む。再接続のあいだもマイクと AudioContext は残す
  const dropLink = () => {
    signaling?.close();
    moq?.close();
    signaling = null;
    moq = null;
    for (const peer of decoders.keys()) {
      closeDecoder(peer);
    }
    for (const peer of roster) {
      audio?.removePeer(peer);
    }
    roster.clear();
  };

  const stop = () => {
    generation += 1;
    clearTimeout(retryTimer);
    unwatchLife?.();
    unwatchLife = undefined;
    dropLink();
    scratch.clear();
    audio?.close();
    audio = null;
    micStarting = null;
    failures = 0;
    sessionId = null;
    myPlayerId = null;
    set({...IDLE, muted});
  };

  const giveUp = (detail: string) => {
    stop();
    set({status: "unavailable", detail});
  };

  // 切れたら、トークンを取り直して繋ぎ直す（トークンの期限切れで切られた場合も含む）
  const reconnect = (why: string) => {
    dropLink();
    generation += 1;
    const mine = generation;
    failures += 1;
    if (failures > MAX_FAILURES) {
      giveUp(why);
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length) - 1]!;
    console.warn(`[voice] ${why}; reconnecting in ${delay}ms`);
    set({status: "connecting", detail: why});
    retryTimer = setTimeout(() => void connect(mine), delay);
  };

  const connect = async (mine: number): Promise<void> => {
    const playerId = myPlayerId;
    if (!playerId) {
      return;
    }
    try {
      const token = await fetchVoiceToken();
      if (mine !== generation) {
        return;
      }
      if (token === null) {
        giveUp("この環境ではVCを使わない");
        return;
      }
      audio ??= createVoiceAudio(audioSettingsStore);
      ensureMic();
      const link = new MoqVoice();
      moq = link;
      await link.start({
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

      const sig = new Signaling(
        `${token.signalingUrl}?token=${encodeURIComponent(token.token)}`,
      );
      signaling = sig;
      sig.onMsg = (m) => {
        switch (m.type) {
          case "peers":
            for (const p of m.peers) {
              if (p.id !== myPlayerId) {
                roster.add(p.id);
                link.handlePeerJoined(p.id);
              }
            }
            break;
          case "peer-joined":
            if (m.id !== myPlayerId) {
              roster.add(m.id);
              link.handlePeerJoined(m.id);
            }
            break;
          case "peer-left":
            roster.delete(m.id);
            link.handlePeerLeft(m.id);
            audio?.removePeer(m.id);
            closeDecoder(m.id);
            break;
          default:
            break;
        }
      };
      await sig.ready;
      if (mine !== generation) {
        return;
      }
      const readyAt = performance.now();
      set({status: "ready", detail: undefined});
      void Promise.race([
        sig.closed.then(() => "signaling closed"),
        link.closed.then(() => "media closed"),
      ]).then((why) => {
        if (mine === generation) {
          if (performance.now() - readyAt > STABLE_MS) {
            failures = 0;
          }
          reconnect(why);
        }
      });
    } catch (e) {
      if (mine !== generation) {
        return;
      }
      reconnect(e instanceof Error ? e.message : String(e));
    }
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
    if (typeof WebTransport === "undefined") {
      set({status: "unavailable", detail: "WebTransport が使えないブラウザ"});
      return;
    }
    sessionId = session;
    myPlayerId = playerId;
    muted = state.muted;
    const offSpectate = subscribeSpectate(() =>
      set({transmitting: transmitting()}),
    );
    // 脱落した瞬間に、もう鳴らす予定に積んである声も止める
    const offLife = playerManager.on("lifeChanged", ({playerId, life}) => {
      if (life === "eliminated" && playerId !== myPlayerId) {
        closeDecoder(playerId);
        audio?.removePeer(playerId);
      }
    });
    unwatchLife = () => {
      offSpectate();
      offLife();
    };
    set({status: "connecting", detail: undefined, transmitting: false});
    await connect(generation);
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

    // ブラウザは最初の操作があるまで AudioContext を止めるので、クリックのたびに起こす。
    // マイクの取得に失敗していた場合も、ここで取り直す
    unlock: (): void => {
      ensureMic();
      void audio?.resume();
    },

    toggleMute: (): void => {
      muted = !muted;
      set({muted, transmitting: transmitting()});
    },

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

export const voiceEngine = createVoiceEngine();

export const useVoiceState = (): VoiceState =>
  useSyncExternalStore(voiceEngine.subscribe, voiceEngine.getState);
