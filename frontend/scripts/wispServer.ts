import {type Server, createServer} from "node:http";
import {pathToFileURL} from "node:url";

import {server as wisp} from "@mercuryworkshop/wisp-js/server";
import type {Plugin} from "vite";

/**
 * このプロジェクト専用のローカル WISP サーバ。
 *
 * WISP は「WebSocket ↔ TCP のリレー」。ブラウザ（PC の画面の Gecko エンジン）は生の TCP を開けないので、
 * 実サイト（http(s)://）への接続はここを経由する。127.0.0.1 にだけ bind する。
 *
 * - `pnpm dev` のとき、Vite プラグイン（wispDevPlugin）が自動で 127.0.0.1:5001 に立てる（無効化は IUBEO_WISP=0）
 * - 単独で立てるなら `pnpm wisp`（WISP_PORT で変更できる）
 * - 既定の接続先は .env.development の VITE_WISP_URL（ws://127.0.0.1:5001/）。?wisp= で上書きできる
 */

export const DEFAULT_WISP_HOST = "127.0.0.1";
export const DEFAULT_WISP_PORT = 5001;

/** 指定の host:port で WISP を待ち受ける。listen できたら resolve する */
export const startWispServer = (
  host: string,
  port: number,
): Promise<Server> => {
  // このプロキシはローカル専用（127.0.0.1）なので、エンジンから localhost の dev サーバ（5173 など）へ
  // つなぐことを許す。共有プロキシとして公開する場合は外すこと（SSRF 対策が既定値の理由）
  wisp.options.allow_private_ips = true;
  wisp.options.allow_loopback_ips = true;

  const server = createServer((_req, res) => {
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end("wisp server (iubeo)");
  });
  server.on("upgrade", (req, socket, head) =>
    wisp.routeRequest(req, socket, head),
  );

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
};

/** `pnpm dev` に同乗する WISP。既に同じポートを使われていても、dev サーバは止めない */
export const wispDevPlugin = (): Plugin => ({
  name: "iubeo:wisp",
  apply: "serve",
  configureServer(server) {
    if (process.env.IUBEO_WISP === "0") {
      return;
    }
    const host = DEFAULT_WISP_HOST;
    const port = Number(process.env.WISP_PORT ?? DEFAULT_WISP_PORT);

    startWispServer(host, port).then(
      (wispServer) => {
        console.log(
          `  ➜  WISP:    ws://${host}:${port}/（実サイトへ出るプロキシ）`,
        );
        server.httpServer?.once("close", () => wispServer.close());
      },
      (error: NodeJS.ErrnoException) => {
        const reason =
          error.code === "EADDRINUSE"
            ? `ポート ${port} は既に使われています（pnpm wisp が起動中なら、そのままで使えます）`
            : error.message;
        console.warn(`  ⚠  WISP を起動できませんでした: ${reason}`);
      },
    );
  },
});

// 単独起動（pnpm wisp）。Node の型除去で直接実行する
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.env.WISP_HOST ?? DEFAULT_WISP_HOST;
  const port = Number(process.env.WISP_PORT ?? DEFAULT_WISP_PORT);
  startWispServer(host, port).then(
    () => {
      console.log(`[wisp] listening on ws://${host}:${port}/`);
      console.log(
        `[wisp] use: http://localhost:5173/?wisp=ws://${host}:${port}/`,
      );
    },
    (error: Error) => {
      console.error(`[wisp] 起動できませんでした: ${error.message}`);
      process.exit(1);
    },
  );
}
