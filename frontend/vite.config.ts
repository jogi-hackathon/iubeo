import {cloudflare} from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

import {bakeSavePlugin} from "./scripts/bakeSavePlugin.ts";
import {judgeDevPlugin} from "./scripts/judgeDev.ts";
import {serveEnginePlugin} from "./scripts/serveEnginePlugin.ts";
import {DEFAULT_WISP_PORT, wispDevPlugin} from "./scripts/wispServer.ts";

// バックエンド(backend/。既定 :8080)。開発時は /api と /healthz を転送し、ブラウザから見て同じオリジンにする
// (プレイヤーは HttpOnly Cookie で識別するため。ADR-0003)。IUBEO_BACKEND_URL で変えられる
const backend = process.env.IUBEO_BACKEND_URL ?? "http://localhost:8080";

const wispPort = Number(process.env.WISP_PORT ?? DEFAULT_WISP_PORT);

// Gecko エンジン（PC の画面）は pthread のために SharedArrayBuffer を使う。COOP/COEP で cross-origin isolation にする
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// bake.html(AO ベイクページ)は dev 専用のツールなので build の入力には含めない(既定の index.html だけ)
export default defineConfig(({command, isPreview}) => ({
  resolve: {
    // three の本体(three.module.js)と WebGPU 版(three.webgpu.js)を両方バンドルしないよう、"three" は WebGPU 版に寄せる
    // (three/webgpu は core を再輸出するので、"three" の import はそのまま同じクラスを使う)
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
