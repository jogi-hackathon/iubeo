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

// presentation ブランチ専用の展示用スタック。Worker 名を変えてあるので、本番の Worker は上書きしない。
// このブランチを main にマージしないこと(main の本番 deploy がこちらの名前を使ってしまう)
const STACK = "-presentation";
// 展示用スタック専用の KV namespace ID(cf kv namespaces create で作る)
const PRESENTATION_KV_ID = "e6cb7f15e82741eda1458f663df3750b";
const FRONTEND_NAME = `iubeo-frontend${STACK}`;
const BACKEND_NAME = `iubeo-backend${STACK}`;
const WISP_NAME = `iubeo-wisp${STACK}`;

// PR プレビューの origin を許可する(backend の IUBEO_ALLOWED_ORIGIN_PATTERNS)。
// 展示用 backend は 1 つしか無いので、どの PR のプレビューからも接続できるようにする
const PREVIEW_ORIGIN_PATTERN = String.raw`https://pr-[0-9]+-iubeo-frontend-presentation\.naokimiura15\.workers\.dev`;

const WISP_ENABLED = process.env.IUBEO_WISP_ENABLED === "1";

const backendContainer = defineContainer({
  name: `iubeo-backend-app${STACK}`,
  schedulingPolicy: "durable-object",
  images: {
    base: {dockerfile: "../backend/Dockerfile"},
  },
});

const wispContainer = defineContainer({
  name: `iubeo-wisp-app${STACK}`,
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
    // VC の鍵は VC ホストの private.jwk の d(terraform.tfvars の vc_private_key と同じ)。
    // Worker の env はコンテナへ自動で渡らないので、worker/backend.ts の voiceEnv が
    // container.start の env へ載せる
    IUBEO_VC_PRIVATE_KEY: bindings.secret(),
    IUBEO_VC_SIGNALING_URL: bindings.text(
      "wss://vc.thirdlf03.com/v1/signaling",
    ),
    IUBEO_VC_MEDIA_URL: bindings.text("https://media.thirdlf03.com:4443"),
    IUBEO_ALLOWED_ORIGIN_PATTERNS: bindings.text(PREVIEW_ORIGIN_PATTERN),
    // 展示用の KV(target は未設定 = コンテナ経路)。本番の KV(EC2 切り替え)とは分ける
    TARGET: bindings.kv({id: PRESENTATION_KV_ID}),
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
