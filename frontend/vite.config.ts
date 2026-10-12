import {cloudflare} from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

import {bakeSavePlugin} from "./scripts/bakeSavePlugin.ts";
import {judgeDevPlugin} from "./scripts/judgeDev.ts";
import {serveEnginePlugin} from "./scripts/serveEnginePlugin.ts";
import {DEFAULT_WISP_PORT, wispDevPlugin} from "./scripts/wispServer.ts";

const backend = process.env.IUBEO_BACKEND_URL ?? "http://localhost:8080";

const wispPort = Number(process.env.WISP_PORT ?? DEFAULT_WISP_PORT);

// Gecko エンジン（PC の画面）は pthread のために SharedArrayBuffer を使う。COOP/COEP で cross-origin isolation にする
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig(({command, isPreview}) => ({
  resolve: {
    alias: [{find: /^three$/, replacement: "three/webgpu"}],
  },
  plugins: [
    react(),
    bakeSavePlugin(),
    serveEnginePlugin(),
    judgeDevPlugin(),
    wispDevPlugin(),
    ...(command === "build" || isPreview ? [cloudflare()] : []),
  ],
  server: {
    // ゲーム内の検索ページ(/api/v1/search/page)は、エンジンが手元の WISP 経由でこのサーバーへ取りに来る。
    // WISP は localhost を 127.0.0.1 に引くので、既定の [::1] ではなく 127.0.0.1 で待ち受ける(ブラウザの localhost は 127.0.0.1 にもつながる)
    host: "127.0.0.1",
    port: 5173,
    // PC の画面の Gecko エンジンは SharedArrayBuffer を使うため、cross-origin isolation が要る
    headers: crossOriginIsolation,
    proxy: {
      "/api": {target: backend, ws: true},
      "/healthz": {target: backend},
      "/wisp": {target: `ws://127.0.0.1:${wispPort}`, ws: true},
    },
  },
}));
