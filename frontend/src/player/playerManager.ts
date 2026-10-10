import type {
  PlayerEvents,
  PlayerId,
  PlayerManagerState,
  PlayerMessage,
  PlayerState,
  PlayerStatus,
  PlayerTransform,
} from "./types";

/** 描画をこれだけ遅らせて、前後に届いた位置の間を補間する(20Hz の配信 2 回分) */
export const INTERPOLATION_DELAY_MS = 100;
const MAX_SAMPLES = 8;
const SEND_INTERVAL_MS = 50;
const GROUND_SPEED_EPSILON = 0.1;

type Sample = {
  at: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
};

type Track = {seq: number; samples: Sample[]};

export type PlayerManagerOptions = {
  /** 今の時刻(ms)。テストで固定する用。既定は performance.now */
  now?: () => number;
  /**
   * 自分のプレイヤー ID(今の)。自分の位置と向きはクライアントで動かすので、届いても持たない。
   * 既定は自分が無い(全員を他のプレイヤーとして持つ)。本番は playerStore.ts が、今のオーソリティの ID を引く
   */
  myPlayerId?: () => PlayerId | null;
};

const bySeat = (a: PlayerStatus, b: PlayerStatus) => a.seat - b.seat;

const toSample = (at: number, t: PlayerTransform): Sample => ({
  at,
  x: t.position[0],
  y: t.position[1],
  z: t.position[2],
  yaw: t.yaw,
  pitch: t.pitch,
});

const lerpAngle = (a: number, b: number, u: number): number => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * u;
};

/**
 * プレイヤーの写し。状態の正はサーバーで、ここはサーバーの通知(apply)を反映するだけ。
 *
 * - 位置と向き以外(接続・生死・手持ち)は state に持ち、変わったら subscribe に通知する
 * - 位置と向きは 20Hz で届くので state には入れず(再描画させない)、受け取った時刻付きで持つ。
 *   描画側は毎フレーム sample で、INTERPOLATION_DELAY_MS 前の位置を補間して読む
 * - 自分(myPlayerId)の位置と向きはクライアントで動かすので、届いても持たない。
 *   snapshot にある自分の transform.seq(送る側の seq を合わせる用)は、接続の側(authority/server/connect.ts)が読む
 */
export const createPlayerManager = ({
  now = () => performance.now(),
  myPlayerId = () => null,
}: PlayerManagerOptions = {}) => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: PlayerManagerState = {players: []};
  const tracks = new Map<PlayerId, Track>();
  let interpolation = true;
  const listeners = new Set<() => void>();
  const handlers: {
    [K in keyof PlayerEvents]: Set<(e: PlayerEvents[K]) => void>;
  } = {
    lifeChanged: new Set(),
  };

  const set = (next: PlayerManagerState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const emit = <K extends keyof PlayerEvents>(
    event: K,
    payload: PlayerEvents[K],
  ) => {
    for (const cb of Array.from(handlers[event])) {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const find = (id: PlayerId): PlayerStatus | undefined =>
    state.players.find((p) => p.playerId === id);

  const push = (id: PlayerId, transform: PlayerTransform, at: number) => {
    const track = tracks.get(id);
    if (!track) {
      tracks.set(id, {seq: transform.seq, samples: [toSample(at, transform)]});
      return;
    }
    if (transform.seq <= track.seq) {
      return;
    }
    track.seq = transform.seq;
    const last = track.samples[track.samples.length - 1];
    if (last && at - last.at > SEND_INTERVAL_MS * 2) {
      track.samples.push({...last, at: at - SEND_INTERVAL_MS});
    }
    track.samples.push(toSample(at, transform));
    while (track.samples.length > MAX_SAMPLES) {
      track.samples.shift();
    }
  };

  return {
    getState: (): PlayerManagerState => state,
    getPlayer: (id: PlayerId): PlayerStatus | undefined => find(id),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <K extends keyof PlayerEvents>(
      event: K,
      callback: (e: PlayerEvents[K]) => void,
    ) => {
      handlers[event].add(callback);
      return () => {
        handlers[event].delete(callback);
      };
    },
    getInterpolation: (): boolean => interpolation,
    setInterpolation: (enabled: boolean): void => {
      interpolation = enabled;
    },
    apply: (message: PlayerMessage): void => {
      switch (message.type) {
        case "reset": {
          const at = now();
          const me = myPlayerId();
          tracks.clear();
          const players: PlayerStatus[] = [];
          for (const {transform, ...status} of message.players) {
            players.push(status);
            if (status.playerId !== me) {
              push(status.playerId, transform, at);
            }
          }
          set({...state, players: players.sort(bySeat)});
          return;
        }
        case "upsert": {
          const {player} = message;
          const prev = find(player.playerId);
          set({
            ...state,
            players: prev
              ? state.players.map((p) =>
                  p.playerId === player.playerId ? player : p,
                )
              : [...state.players, player].sort(bySeat),
          });
          if (prev && prev.life !== player.life) {
            emit("lifeChanged", {playerId: player.playerId, life: player.life});
          }
          return;
        }
        case "transforms": {
          const at = now();
          const me = myPlayerId();
          for (const {playerId, transform} of message.players) {
            if (playerId !== me) {
              push(playerId, transform, at);
            }
          }
          return;
        }
      }
    },
    sample: (id: PlayerId, at: number, out: PlayerState): boolean => {
      const samples = tracks.get(id)?.samples;
      const first = samples?.[0];
      if (!samples || !first) {
        return false;
      }
      const last = samples[samples.length - 1]!;
      const t = interpolation ? at - INTERPOLATION_DELAY_MS : last.at;
      let i = 0;
      while (i < samples.length - 1 && samples[i]!.at < t) {
        i++;
      }
      const b = samples[i]!;
      const a = samples[i - 1] ?? b;
      const span = b.at - a.at;
      const inSegment = span > 0 && t >= a.at && t <= b.at;
      const u = inSegment ? (t - a.at) / span : 1;
      out.position.set(
        a.x + (b.x - a.x) * u,
        a.y + (b.y - a.y) * u,
        a.z + (b.z - a.z) * u,
      );
      out.yaw = lerpAngle(a.yaw, b.yaw, u);
      out.pitch = a.pitch + (b.pitch - a.pitch) * u;
      if (inSegment) {
        const sec = span / 1000;
        out.velocity.set(
          (b.x - a.x) / sec,
          (b.y - a.y) / sec,
          (b.z - a.z) / sec,
        );
      } else {
        out.velocity.set(0, 0, 0);
      }
      const prev = samples[i - 2];
      const prevVy =
        inSegment && prev && a.at > prev.at
          ? ((a.y - prev.y) * 1000) / (a.at - prev.at)
          : 0;
      out.onGround =
        Math.abs(out.velocity.y) <= GROUND_SPEED_EPSILON &&
        Math.abs(prevVy) <= GROUND_SPEED_EPSILON;
      if (!interpolation && at - last.at > SEND_INTERVAL_MS * 2) {
        out.velocity.set(0, 0, 0);
        out.onGround = true;
      }
      return true;
    },
  };
};

export type PlayerManager = ReturnType<typeof createPlayerManager>;
