export type VcPeer = {id: string};

export type VcServerMsg =
  | {type: "peers"; peers: VcPeer[]}
  | {type: "peer-joined"; id: string}
  | {type: "peer-left"; id: string}
  | {type: "signal"; from: string; data: unknown}
  | {type: "pong"; t: number}
  | {type: "error"; code: string; message: string};

export type VcClientMsg =
  | {type: "signal"; to: string; data: unknown}
  | {type: "ping"; t: number};

// VC サーバーはクライアントから 60 秒何も届かないと WS を閉じ、roster から外す。
// roster に居ないと moq-relay の revalidate で音声も切られるので、それより短い間隔で ping を送る
const PING_INTERVAL_MS = 20_000;

const parse = (raw: string): VcServerMsg | undefined => {
  try {
    const v: unknown = JSON.parse(raw);
    if (
      typeof v === "object" &&
      v !== null &&
      typeof (v as {type: unknown}).type === "string"
    ) {
      return v as VcServerMsg;
    }
  } catch {}
  return undefined;
};

export class Signaling {
  readonly ws: WebSocket;
  readonly ready: Promise<void>;
  /** WS が閉じたら解決する */
  readonly closed: Promise<void>;
  onMsg: (m: VcServerMsg) => void = () => {};
  private pingTimer?: ReturnType<typeof setInterval>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    let markClosed!: () => void;
    this.closed = new Promise((resolve) => {
      markClosed = resolve;
    });
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.pingTimer = setInterval(
          () => this.send({type: "ping", t: performance.now()}),
          PING_INTERVAL_MS,
        );
        resolve();
      };
      this.ws.onerror = () => reject(new Error("signaling: ws error"));
      this.ws.onclose = (ev) => {
        clearInterval(this.pingTimer);
        reject(new Error(`signaling: closed (${ev.code})`));
        markClosed();
      };
    });
    this.ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") {
        return;
      }
      const m = parse(ev.data);
      if (m) {
        this.onMsg(m);
      }
    };
  }

  send(m: VcClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m));
    }
  }

  close(): void {
    clearInterval(this.pingTimer);
    try {
      this.ws.close();
    } catch {}
  }
}
