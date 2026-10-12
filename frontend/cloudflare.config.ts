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
    IUBEO_VC_PRIVATE_KEY: bindings.secret(),
    IUBEO_VC_SIGNALING_URL: bindings.text(
      "wss://vc.thirdlf03.com/v1/signaling",
    ),
    IUBEO_VC_MEDIA_URL: bindings.text("https://media.thirdlf03.com:4443"),
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

const frontendWorker = defineWorker({
  name: FRONTEND_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint: frontendEntry,
  observability: {enabled: true},
  assets: {
    notFoundHandling: "single-page-application",
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
