import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

import {bakeSavePlugin} from "./scripts/bakeSavePlugin.ts";

// バックエンド(backend/。既定 :8080)。開発時は /api と /healthz を転送し、ブラウザから見て同じオリジンにする
// (プレイヤーは HttpOnly Cookie で識別するため。ADR-0003)。IUBEO_BACKEND_URL で変えられる
const backend = process.env.IUBEO_BACKEND_URL ?? "http://localhost:8080";

// bake.html(AO ベイクページ)は dev 専用のツールなので build の入力には含めない(既定の index.html だけ)
export default defineConfig({
  plugins: [react(), bakeSavePlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {target: backend, ws: true},
      "/healthz": {target: backend},
    },
  },
});
