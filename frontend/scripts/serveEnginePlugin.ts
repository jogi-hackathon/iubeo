import {createReadStream, existsSync, statSync} from "node:fs";
import {resolve} from "node:path";

import type {Plugin} from "vite";

/**
 * dev サーバー専用。`engine-local/`（Gecko エンジン）を「ソース」ではなく素の配信物として返す。
 *
 * 経緯: エンジンは public/ に置いた素のファイルで、動的 import で URL から読む。ところが dev サーバでは、
 * ソース中の動的 import を Vite が変換して `?import` を付けるため、public 配信ではなく変換の経路に乗り、
 * 「should not be imported from source code」で 500 になる。@vite-ignore を付けても変換は避けられない。
 * そこで Vite の内部ミドルウェアより前に割り込み、/engine/ 配下はクエリを落として素の静的ファイルとして返す。
 */
export const serveEnginePlugin = (): Plugin => {
  const root = resolve(process.cwd(), "engine-local");

  const contentType = (file: string): string => {
    if (file.endsWith(".js")) {
      return "text/javascript; charset=utf-8";
    }
    if (file.endsWith(".json")) {
      return "application/json; charset=utf-8";
    }
    if (file.endsWith(".d.ts")) {
      return "text/plain; charset=utf-8";
    }
    if (file.endsWith(".wasm")) {
      return "application/wasm";
    }
    return "application/octet-stream";
  };

  return {
    name: "iubeo:serve-engine",
    apply: "serve",
    configureServer(server) {
      // configureServer の中で直接 use() すると、Vite 内部のミドルウェアより先に走る
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        if (!path.startsWith("/engine/")) {
          return next();
        }

        const file = resolve(
          root,
          decodeURIComponent(path.slice("/engine/".length)),
        );
        // `..` で配信ディレクトリの外へ出る要求は通さない
        if (
          !file.startsWith(root) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          res.statusCode = 404;
          res.end("engine asset not found");
          return;
        }

        res.setHeader("Content-Type", contentType(file));
        // エンジンは差し替えながら使うので基本はキャッシュさせない。wasm だけは、ブラウザの
        // streaming compile（コードキャッシュ）が HTTP キャッシュに紐づくので、キャッシュさせる
        res.setHeader(
          "Cache-Control",
          file.endsWith(".wasm") ? "public, max-age=3600" : "no-store",
        );
        createReadStream(file).pipe(res);
      });
    },
  };
};
