import {createReadStream, existsSync, statSync} from "node:fs";
import {resolve} from "node:path";

import type {Plugin} from "vite";

// dev では Vite が動的 import に ?import を付けて変換の経路に乗せ、「should not be imported from source code」で 500 になる。
// @vite-ignore でも避けられないので、内部ミドルウェアより前で素の静的ファイルとして返す
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
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        if (!path.startsWith("/engine/")) {
          return next();
        }

        const file = resolve(
          root,
          decodeURIComponent(path.slice("/engine/".length)),
        );
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
        res.setHeader(
          "Cache-Control",
          file.endsWith(".wasm") ? "public, max-age=3600" : "no-store",
        );
        createReadStream(file).pipe(res);
      });
    },
  };
};
