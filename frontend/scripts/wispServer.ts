import {type Server, createServer} from "node:http";
import {pathToFileURL} from "node:url";

import {server as wisp} from "@mercuryworkshop/wisp-js/server";
import type {Plugin} from "vite";

import {tokenFromUrl, verifyWispToken} from "../worker/wispToken.ts";

/**
 * このプロジェクト専用のローカル WISP サーバ。
 *
 * WISP は「WebSocket ↔ TCP のリレー」。ブラウザ（PC の画面の Gecko エンジン）は生の TCP を開けないので、
 * 実サイト（http(s)://）への接続はここを経由する。127.0.0.1 にだけ bind する。
 *
 * - `pnpm dev` のとき、Vite プラグイン（wispDevPlugin）が自動で 127.0.0.1:5001 に立てる（無効化は IUBEO_WISP=0）
 * - 単独で立てるなら `pnpm wisp`（WISP_PORT で変更できる）
 * - 既定の接続先は .env.development の VITE_WISP_URL（ws://127.0.0.1:5001/）。?wisp= で上書きできる
 * - `IUBEO_WISP_KEY` があれば、本番の WISP の Worker と同じく `?token=` を検証する（無い・無効なら 401）。
 *   本番と同じトークンの流れ（バックエンドが発行 → /wisp/ で検証）を、手元だけで確かめるため
 */

export const DEFAULT_WISP_HOST = "127.0.0.1";
export const DEFAULT_WISP_PORT = 5001;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * ブラウザからの接続を許すか。ブラウザは別のサイトからでも localhost の WebSocket を開けるので、
 * 開発中のアプリ（localhost のオリジン）以外は拒む。Origin の無い接続（ブラウザ以外）は通す
 */
export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};

/**
 * 指定の host:port で WISP を待ち受ける。listen できたら resolve する。
 * tokenKey があれば、接続ごとに `?token=` を検証する（worker/wisp.ts と同じ）
 */
export const startWispServer = (
  host: string,
  port: number,
  tokenKey?: string,
): Promise<Server> => {
  // ローカル専用（127.0.0.1）で立てるときだけ、エンジンから localhost の dev サーバ（5173 など）へ
  // つなぐことを許す。それ以外の host で立てると、同じネットワークの誰でも内側へ入れてしまう（SSRF）
  const local = LOOPBACK_HOSTS.has(host);
  wisp.options.allow_private_ips = local;
  wisp.options.allow_loopback_ips = local;

  const server = createServer((_req, res) => {
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end("wisp server (iubeo)");
  });
  server.on("upgrade", (req, socket, head) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!tokenKey) {
      wisp.routeRequest(req, socket, head);
      return;
    }
    const token = tokenFromUrl(`http://wisp${req.url ?? "/"}`);
    void verifyWispToken(token, tokenKey).then((playerId) => {
      if (playerId === null) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        return;
      }
      wisp.routeRequest(req, socket, head);
    });
  });

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
    const tokenKey = process.env.IUBEO_WISP_KEY || undefined;

    startWispServer(host, port, tokenKey).then(
      (wispServer) => {
        console.log(
          `  ➜  WISP:    ws://${host}:${port}/（実サイトへ出るプロキシ${tokenKey ? "。トークンを検証する" : ""}）`,
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
  startWispServer(host, port, process.env.IUBEO_WISP_KEY || undefined).then(
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
