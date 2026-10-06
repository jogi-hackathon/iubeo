import {
  bindings,
  defineConfig,
  defineContainer,
  defineWorker,
  exports,
} from "cf/config";

import * as entrypoint from "./worker/index.ts" with {type: "cf-worker"};

// cf と cloudflare.config.ts はベータなので、更新時は
// https://developers.cloudflare.com/cf/ で設定形式を確認する。
const WORKER_NAME = "iubeo-frontend";

/**
 * Go サーバーを動かす Container。
 *
 * `schedulingPolicy: "durable-object"` が必要。既定の schedulingPolicy だと実行時に
 * `container.images` が空になり、`start({image, env})` に渡す image が取れないので、
 * 署名鍵をコンテナの環境変数として渡せない(実機で確認済み)。
 *
 * この形では `env` に BACKEND バインディングを置かない。置くと自己参照の
 * Durable Object バインディングが `script_name` 付きで出力され、`cf deploy` が
 * 「別 Worker の DO を参照している」として失敗するため、Worker 側は
 * `ctx.exports.Backend` で自分の DO を参照する。
 *
 * なお DO 管理では instanceType をここに書けない(スキーマが strictObject で拒否する)。
 * 起動時の instance で指定する必要があり、basic(0.25 vCPU / 1 GiB)は選べない。
 */
const backend = defineContainer({
  name: "iubeo-backend",
  schedulingPolicy: "durable-object",
  images: {
    // backend/ をビルドコンテキストにする
    base: {dockerfile: "../backend/Dockerfile"},
  },
});

const worker = defineWorker({
  name: WORKER_NAME,
  compatibilityDate: "2026-10-01",
  entrypoint,
  observability: {enabled: true},
  assets: {
    // `cf` が検出した Vite のビルド出力を配信する
    // クライアント側ルーティング(index.html へフォールバック)
    notFoundHandling: "single-page-application",
    // 画面と API を同じオリジンにして Cookie(SameSite=Lax)を通すため、
    // Worker が先に受けてコンテナへ転送する
    runWorkerFirst: ["/api/*", "/healthz"],
  },
  exports: {
    Backend: exports.durableObject({storage: "sqlite", container: backend}),
  },
  env: {
    // Go サーバーの IUBEO_SIGNING_KEY。値は secrets file か
    // `cf workers secrets` で登録する
    IUBEO_SIGNING_KEY: bindings.secret(),
    // /api と /ws の転送先。key "target" が "ec2" なら本番相当(EC2 + EIP)へ、
    // それ以外なら Cloudflare Containers へ流す。
    // Lambda(Discord の /start /stop)がこの値を書き換える
    TARGET: bindings.kv({id: "8361d5aab4a34661bc593816214bcab6"}),
  },
});

export default defineConfig({
  worker,
  containers: [backend],
});
