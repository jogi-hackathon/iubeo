import type * as Moq from "@moq/net";

/** Opus の 1 フレーム（20ms @ 48kHz）。マイクの PCM をこの長さに切って送る */
const FRAME_SAMPLES = 960;
const SAMPLE_RATE = 48000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MoqVoiceOptions = {
  /** MoQ(WebTransport)の URL。例: https://media.example.test:4443 */
  url: string;
  /** VC の JWT。moq-relay が ?jwt= として auth-url へ渡す */
  token: string;
  /** 部屋（セッション id） */
  room: string;
  /** 自分の id（プレイヤー id） */
  id: string;
  /** 他の人から届いた Opus のフレーム */
  onPeerAudio: (peer: string, opus: Uint8Array) => void;
  onError?: (message: string) => void;
};

/**
 * MoQ(moq-lite / WebTransport)で声を送る・受ける。
 * 各クライアントは broadcast `vc-bench/<room>/<id>` の `audio` トラックを publish し、
 * roster に居る他の人の broadcast を subscribe する。Opus のフレームは単一フレームの
 * group = QUIC datagram として送る（best-effort）。位置はゲーム側の transforms を使い、ここでは扱わない。
 *
 * `@moq/net` は重く、モジュールの評価でブラウザの API に触れることがあるので、
 * 実際に繋ぐとき（start）に動的 import する
 */
export class MoqVoice {
  private Moq!: typeof import("@moq/net");
  private conn?: Moq.Connection.Established;
  private origin?: Moq.Origin.Producer;
  private track?: Moq.Track.Producer;
  private encoder?: AudioEncoder;
  private readonly subs = new Set<string>();
  private acc = new Float32Array(0);
  private tsUs = 0;
  private ietf = false;
  private opts!: MoqVoiceOptions;

  async start(opts: MoqVoiceOptions): Promise<void> {
    this.opts = opts;
    const Moq = await import("@moq/net");
    this.Moq = Moq;

    const origin = new Moq.Origin.Producer();
    this.origin = origin;

    const mediaUrl = new URL(opts.url);
    mediaUrl.searchParams.set("jwt", opts.token);
    this.conn = await Moq.Connection.connect({
      url: mediaUrl,
      webtransport: {},
      publish: origin.consume(),
      consume: origin,
      signal: AbortSignal.timeout(15000),
    });
    // moq-lite は datagram、IETF は group が最小単位（bench/client と同じ扱い）
    this.ietf = !String(this.conn.version).startsWith("moq-lite");

    const broadcast = origin.createBroadcast(
      Moq.Path.from("vc-bench", opts.room, opts.id),
    );
    this.track = broadcast.createTrack("audio", {
      priority: 128,
      maxAge: Moq.Time.Milli(150),
    });
    broadcast.announce();

    this.encoder = new AudioEncoder({
      output: (chunk) => this.sendOpus(chunk),
      error: (e) => opts.onError?.(`encode: ${e.message}`),
    });
    this.encoder.configure({
      codec: "opus",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: 32000,
      latencyMode: "realtime",
    } as AudioEncoderConfig);
  }

  private sendOpus(chunk: EncodedAudioChunk): void {
    const payload = new Uint8Array(chunk.byteLength);
    chunk.copyTo(payload);
    try {
      if (this.ietf) {
        const group = this.track!.appendGroup();
        group.writeFrame({
          timestamp: this.Moq.Time.Timestamp.fromMillis(Date.now()),
          payload,
        });
        group.close();
      } else {
        this.track!.appendDatagram(
          this.Moq.Time.Timestamp.fromMillis(Date.now()),
          payload,
        );
      }
    } catch {
      /* 接続が閉じた */
    }
  }

  /** マイクの PCM を 20ms ずつ Opus にして送る。enabled が false の間は送らない（push-to-talk） */
  publishPcm(pcm: Float32Array, enabled: boolean): void {
    if (!enabled || !this.encoder) {
      return;
    }
    const merged = new Float32Array(this.acc.length + pcm.length);
    merged.set(this.acc);
    merged.set(pcm, this.acc.length);
    this.acc = merged;
    while (this.acc.length >= FRAME_SAMPLES) {
      const frame = this.acc.subarray(0, FRAME_SAMPLES).slice();
      this.acc = this.acc.subarray(FRAME_SAMPLES);
      const audio = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: FRAME_SAMPLES,
        numberOfChannels: 1,
        timestamp: this.tsUs,
        data: frame.buffer as ArrayBuffer,
      });
      this.tsUs += (FRAME_SAMPLES / SAMPLE_RATE) * 1e6;
      this.encoder.encode(audio);
      audio.close();
    }
  }

  handlePeerJoined(peer: string): void {
    void this.watchPeer(peer);
  }

  handlePeerLeft(peer: string): void {
    this.subs.delete(peer);
  }

  private async watchPeer(peer: string): Promise<void> {
    if (this.subs.has(peer) || !this.origin) {
      return;
    }
    this.subs.add(peer);
    const req = this.origin.request(
      this.Moq.Path.from("vc-bench", this.opts.room, peer),
      {announced: true},
    );
    for (let i = 0; i < 100; i++) {
      const broadcast = req.active.peek();
      if (broadcast) {
        const sub = broadcast
          .track("audio")
          .subscribe({maxAge: this.Moq.Time.Milli(150)});
        void this.pumpDatagrams(peer, sub);
        void this.pumpGroups(peer, sub);
        return;
      }
      await sleep(100);
    }
    this.opts.onError?.(`moq: no broadcast for ${peer}`);
  }

  private async pumpDatagrams(
    peer: string,
    sub: Moq.Track.Subscriber,
  ): Promise<void> {
    try {
      for (;;) {
        const datagram = await sub.recvDatagram();
        if (!datagram) {
          return;
        }
        this.opts.onPeerAudio(peer, datagram.payload);
      }
    } catch {
      /* subscription closed */
    }
  }

  private async pumpGroups(
    peer: string,
    sub: Moq.Track.Subscriber,
  ): Promise<void> {
    try {
      for (;;) {
        const group = await sub.recvGroup();
        if (!group) {
          return;
        }
        for (;;) {
          const frame = await group.readFrame();
          if (!frame) {
            break;
          }
          this.opts.onPeerAudio(peer, frame.payload);
        }
      }
    } catch {
      /* subscription closed */
    }
  }

  close(): void {
    try {
      this.conn?.close();
    } catch {
      /* already closed */
    }
    try {
      this.encoder?.close();
    } catch {
      /* already closed */
    }
    this.subs.clear();
    this.origin = undefined;
    this.track = undefined;
    this.conn = undefined;
  }
}
