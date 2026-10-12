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
  onMsg: (m: VcServerMsg) => void = () => {};

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("signaling: ws error"));
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
    try {
      this.ws.close();
    } catch {}
  }
}
