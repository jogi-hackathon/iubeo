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
/** プレイヤーごとに持つ位置の数。遅延(100ms)を 20Hz で埋めるのに足りる分 */
const MAX_SAMPLES = 8;
/** サーバーが transforms を配る間隔(20Hz) */
const SEND_INTERVAL_MS = 50;
/** 上下の速さ(m/s)がこれ以下なら接地とみなす。サーバーは地形を持たないので近似 */
const GROUND_SPEED_EPSILON = 0.1;

type Sample = {
  /** 受け取った時刻(ms。クライアントの時計) */
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

/** a から b へ、近い回り方で u だけ進めた角度 */
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
  // false なら補間せず、最後に届いた位置をそのまま描く(比べる用)
  let interpolation = true;
  const listeners = new Set<() => void>();
  const handlers: {
    [K in keyof PlayerEvents]: Set<(e: PlayerEvents[K]) => void>;
  } = {
    lifeChanged: new Set(),
  };

  // コールバックの例外が他のコールバック・状態更新に影響しないようにする
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
    // 通知中に追加されたコールバックは、今回のイベントでは呼ばない
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

  /** 位置を足す。seq が増えていない物(古い・重複)は捨てる */
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
    // 止まっている間は届かないので、動き出しの位置が前の位置からずっと離れた時刻に届く。そのまま補間すると、
    // 長い区間のほとんどが過ぎた所から始まり、1 歩分を一気に進んでから止まって見える。
    // 前の位置を、配信 1 回分前に置き直して、動き出しも遅延の分だけ遅らせて補間する
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
    /** 補間するか。切ると、最後に届いた位置をそのまま描く(遅延なし・20Hz でカクつく)。比べる用 */
    getInterpolation: (): boolean => interpolation,
    setInterpolation: (enabled: boolean): void => {
      interpolation = enabled;
    },
    /** サーバーの通知を反映する */
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
    /**
     * 時刻 at(ms)の INTERPOLATION_DELAY_MS 前の位置と向きを、前後に届いた位置から補間して out に書く。
     * velocity は補間している区間の速さ、onGround は上下の速さからの近似(骨格のアニメーション用)。
     * 最後に届いた位置より後は、そこで止める(先読みはしない)。位置が 1 つも無ければ何もせず false。
     * 補間を切っているときは、最後に届いた位置をそのまま書く(velocity は最後の区間の速さ。届かなくなったら 0)
     */
    sample: (id: PlayerId, at: number, out: PlayerState): boolean => {
      const samples = tracks.get(id)?.samples;
      const first = samples?.[0];
      if (!samples || !first) {
        return false;
      }
      const last = samples[samples.length - 1]!;
      const t = interpolation ? at - INTERPOLATION_DELAY_MS : last.at;
      // t を挟む区間 [samples[i-1], samples[i]]。t が最初より前なら i=0、最後より後なら i=最後(どちらも区間なし)
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
      // 区間の外(最後の位置で止めている間)は止まっているとみなす
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
      // ジャンプの頂点では、頂点をまたぐ区間の上下の速さが 0 近くになる。1 つ前の区間も上下に動いていなければ
      // 接地とみなす(頂点の前後は上昇・下降中なので、頂点で一瞬だけ接地に見えない)
      const prev = samples[i - 2];
      const prevVy =
        inSegment && prev && a.at > prev.at
          ? ((a.y - prev.y) * 1000) / (a.at - prev.at)
          : 0;
      out.onGround =
        Math.abs(out.velocity.y) <= GROUND_SPEED_EPSILON &&
        Math.abs(prevVy) <= GROUND_SPEED_EPSILON;
      // 補間なしで、しばらく届いていなければ止まったとみなす(最後の区間の速さで歩き続けないように)
      if (!interpolation && at - last.at > SEND_INTERVAL_MS * 2) {
        out.velocity.set(0, 0, 0);
        out.onGround = true;
      }
      return true;
    },
  };
};

export type PlayerManager = ReturnType<typeof createPlayerManager>;
