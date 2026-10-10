import {
  bindings,
  defineConfig,
  defineContainer,
  defineWorker,
  exports,
} from "cf/config";

import * as backendEntry from "./worker/backend.ts" with {type: "cf-worker"};
import * as frontendEntry from "./worker/frontend.ts" with {type: "cf-worker"};
import * as wispEntry from "./worker/wisp.ts" with {type: "cf-worker"};

const FRONTEND_NAME = "iubeo-frontend";
const BACKEND_NAME = "iubeo-backend";
const WISP_NAME = "iubeo-wisp";

const WISP_ENABLED = process.env.IUBEO_WISP_ENABLED === "1";

const backendContainer = defineContainer({
  name: "iubeo-backend-app",
  schedulingPolicy: "durable-object",
  images: {
    base: {dockerfile: "../backend/Dockerfile"},
  },
});

/**
 * WISP のコンテナ。実サイトへ出るので、インターネットへの通信を許す(backend と違う点)。
 * イメージは wisp/ の Dockerfile(wisp-js の WISP サーバー)。
 */
const wispContainer = defineContainer({
  name: "iubeo-wisp-app",
  schedulingPolicy: "durable-object",
  images: {
    base: {dockerfile: "../wisp/Dockerfile"},
  },
});

const backendWorker = defineWorker({
  name: BACKEND_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint: backendEntry,
  observability: {enabled: true},
  exports: {
    Backend: exports.durableObject({
      storage: "sqlite",
      container: backendContainer,
    }),
  },
  env: {
    IUBEO_SIGNING_KEY: bindings.secret(),
    IUBEO_WISP_KEY: bindings.secret(),
    IUBEO_WISP_PASS: bindings.secret(),
    TARGET: bindings.kv({id: "8361d5aab4a34661bc593816214bcab6"}),
  },
});

const wispWorker = defineWorker({
  name: WISP_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint: wispEntry,
  observability: {enabled: true},
  exports: {
    Wisp: exports.durableObject({
      storage: "sqlite",
      container: wispContainer,
    }),
  },
  env: {
    WISP_KEY: bindings.secret(),
    TARGET: bindings.kv({id: "8361d5aab4a34661bc593816214bcab6"}),
  },
});

/**
 * フロントの Worker。コンテナを持たないので Previews が使える。
 * /api と /ws はサービスバインディングでバックエンドへ流し、/judge は自分で受ける。
 */
const frontendWorker = defineWorker({
  name: FRONTEND_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint: frontendEntry,
  observability: {enabled: true},
  assets: {
    notFoundHandling: "single-page-application",
    // 画面と API を同じオリジンにして Cookie(SameSite=Lax)を通すため、
    // Worker が先に受けてバックエンドへ転送する。/judge は Worker 自身が受ける(SPA へ落とさない)
    runWorkerFirst: ["/api/*", "/healthz", "/wisp/*", "/judge"],
  },
  env: {
    BACKEND: bindings.worker({worker: BACKEND_NAME}),
    ...(WISP_ENABLED ? {WISP: bindings.worker({worker: WISP_NAME})} : {}),
    AI: bindings.ai(),
    JUDGE_IP_LIMIT: bindings.rateLimit({
      namespace: "1001",
      simple: {limit: 20, period: 60},
    }),
    JUDGE_GLOBAL_LIMIT: bindings.rateLimit({
      namespace: "1002",
      simple: {limit: 300, period: 60},
    }),
  },
});

export default defineConfig(({mode}) => {
  if (mode === "backend") {
    return {
      worker: backendWorker,
      containers: [backendContainer],
    };
  }
  if (mode === "wisp") {
    return {
      worker: wispWorker,
      containers: [wispContainer],
    };
  }
  return {worker: frontendWorker};
});
