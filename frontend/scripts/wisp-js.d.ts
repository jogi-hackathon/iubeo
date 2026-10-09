// @mercuryworkshop/wisp-js は型定義を持たないので、使う部分だけ宣言する
declare module "@mercuryworkshop/wisp-js/server" {
  import type {IncomingMessage} from "node:http";
  import type {Duplex} from "node:stream";

  export const server: {
    options: {allow_private_ips: boolean; allow_loopback_ips: boolean};
    routeRequest(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  };
}
