import {
  bindings,
  defineConfig,
  defineContainer,
  defineWorker,
  exports,
} from "cf/config";

import * as backendEntry from "./worker/backend.ts" with {type: "cf-worker"};
import * as frontendEntry from "./worker/frontend.ts" with {type: "cf-worker"};

// cf と cloudflare.config.ts はベータなので、更新時は
// https://developers.cloudflare.com/cf/ で設定形式を確認する。
//
// Worker を 2 つに分けている。コンテナを持つ Worker は Worker Previews に
// 対応していないため、プレビューが要る静的アセット側を分けた。
//
//   cf deploy                → iubeo-frontend(静的アセット + プロキシ)
//   cf deploy --mode backend → iubeo-backend(コンテナ + DO)
const FRONTEND_NAME = "iubeo-frontend";
const BACKEND_NAME = "iubeo-backend";

/**
 * Go サーバーを動かす Container。
 *
 * `schedulingPolicy: "durable-object"` が必要。既定の schedulingPolicy だと実行時に
 * `container.images` が空になり、`start({image, env})` に渡す image が取れないので、
 * 署名鍵をコンテナの環境変数として渡せない(実機で確認済み)。
 */
const backendContainer = defineContainer({
  name: "iubeo-backend-app",
  schedulingPolicy: "durable-object",
  images: {
    // backend/ をビルドコンテキストにする
    base: {dockerfile: "../backend/Dockerfile"},
  },
});

/** バックエンドの Worker。コンテナと DO を持ち、転送先を KV で決める */
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
    // Go サーバーの IUBEO_SIGNING_KEY。secrets file か `cf workers secrets` で登録する
    IUBEO_SIGNING_KEY: bindings.secret(),
    // "target" が "ec2" なら本番相当(EC2 + EIP)へ、それ以外は Containers へ。
    // Lambda(Discord の /ec2start /ec2stop)がこの値を書き換える
    TARGET: bindings.kv({id: "8361d5aab4a34661bc593816214bcab6"}),
  },
});

/**
 * フロントの Worker。コンテナを持たないので Previews が使える。
 * /api と /ws はサービスバインディングでバックエンドへ流す。
 */
const frontendWorker = defineWorker({
  name: FRONTEND_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint: frontendEntry,
  observability: {enabled: true},
  assets: {
    // `cf` が検出した Vite のビルド出力を配信する
    // クライアント側ルーティング(index.html へフォールバック)
    notFoundHandling: "single-page-application",
    // 画面と API を同じオリジンにして Cookie(SameSite=Lax)を通すため、
    // Worker が先に受けてバックエンドへ転送する
    runWorkerFirst: ["/api/*", "/healthz"],
  },
  env: {
    BACKEND: bindings.worker({worker: BACKEND_NAME}),
  },
});

export default defineConfig(({mode}) => {
  // バックエンドはコンテナを持つので別モードにしてある
  if (mode === "backend") {
    return {
      worker: backendWorker,
      containers: [backendContainer],
    };
  }
  return {worker: frontendWorker};
});
