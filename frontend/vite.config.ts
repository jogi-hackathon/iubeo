import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

import {bakeSavePlugin} from "./scripts/bakeSavePlugin.ts";

// bake.html(AO ベイクページ)は dev 専用のツールなので build の入力には含めない(既定の index.html だけ)
export default defineConfig({
  plugins: [react(), bakeSavePlugin()],
  server: {port: 5173},
});
