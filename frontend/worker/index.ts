/**
 * Cloudflare Workers のエントリポイント。
 *
 * - `/api/*` と `/healthz` は Cloudflare Containers の Go サーバーへ転送する
 * - それ以外は静的アセット(SPA)を返す
 *
 * 画面と API を同じオリジンにすることで、プレイヤーの Cookie(`SameSite=Lax`)が
 * そのまま送られる。`workers.dev` は Public Suffix List にあるため、
 * 別サブドメインに置くと Cookie が飛ばず 401 になる。
 */
import {DurableObject} from "cloudflare:workers";

interface Env {
  ASSETS: Fetcher;
  /** HMAC の署名鍵(32 バイト以上)。secrets file か `cf workers secrets` で登録する */
  IUBEO_SIGNING_KEY: string;
}

/** Go サーバーが待ち受けるポート(backend/internal/config の既定 :8080) */
const CONTAINER_PORT = 8080;
/** ヘルスチェックのパス(backend/api/openapi.yaml の /healthz) */
const HEALTH_PATH = "/healthz";
/** これだけアクセスが無ければコンテナを眠らせる。遊ばれていない間の課金を止める */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
/** コンテナの起動を待つ最大時間 */
const START_TIMEOUT_MS = 90_000;
/**
 * コンテナのスペック。Durable Object 管理では basic(0.25 vCPU / 1 GiB)が
 * 選べないので standard-1 にする。lite(1/16 vCPU / 256 MiB)は安いが
 * 20Hz の配信には CPU が足りない可能性が高い。
 */
const INSTANCE = "standard-1";

/**
 * Backend は Containers の Go サーバーを起動し、リクエストを転送する Durable Object。
 *
 * コンテナは 1 つだけ動かす(ADR-0004: セッションの状態をメモリに持つため単一プロセス)。
 */
export class Backend extends DurableObject<Env> {
  private starting: Promise<void> | undefined;

  async fetch(request: Request): Promise<Response> {
    // このリクエストの公開オリジン。Go サーバーの IUBEO_ALLOWED_ORIGINS に渡す
    // (ブラウザが見る Origin と同じになる)
    const origin = new URL(request.url).origin;

    // 同時に来たリクエストで起動処理を共有する
    this.starting ??= this.startAndWait(origin).finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    // WebSocket への切り替えを保つため、そのまま返す
    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }

  private async startAndWait(origin: string): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      // durable-object ポリシーでは images に Dockerfile から作った image が入る
      const image = container.images.base;
      if (!image) {
        throw new Error("コンテナのイメージが見つからない");
      }
      const key = this.env.IUBEO_SIGNING_KEY;
      if (!key) {
        throw new Error("IUBEO_SIGNING_KEY が未設定(secrets file で登録する)");
      }
      container.start({
        image,
        instance: INSTANCE,
        // Go サーバーは外部に何も取りに行かないので閉じる
        enableInternet: false,
        // Go サーバーは起動時にこれらを検証し、足りなければ終了する
        // (backend/internal/config)
        env: {
          IUBEO_ADDR: `:${CONTAINER_PORT}`,
          IUBEO_SIGNING_KEY: key,
          IUBEO_ALLOWED_ORIGINS: origin,
          IUBEO_MATCH_SIZE: "3",
        },
      });
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(CONTAINER_PORT);
    const deadline = Date.now() + START_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await port.fetch(`http://container${HEALTH_PATH}`, {
          signal: AbortSignal.timeout(2000),
        });
        await res.body?.cancel();
        if (res.ok) {
          return;
        }
        lastError = new Error(`health check returned ${res.status}`);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(300);
    }
    throw new Error("コンテナが起動しなかった", {cause: lastError});
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const {pathname} = new URL(request.url);
    // assets.runWorkerFirst で /api/* と /healthz だけここに来る。
    // それ以外(アセットに一致しなかったパス)は SPA として index.html を返す。
    if (pathname.startsWith("/api/") || pathname === HEALTH_PATH) {
      // env に DO バインディングを置くと cf deploy が「別 Worker の DO」として
      // 失敗するため、自分の export へのループバック(ctx.exports)で参照する。
      // 型は `cf workers types` の生成物でないと生えないので、ここで形を宣言する
      const backend = (ctx.exports as unknown as LoopbackExports).Backend;
      // コンテナは 1 つなので、名前を固定して常に同じインスタンスに送る
      return backend.getByName("game").fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/**
 * `ctx.exports` のうち、この Worker が使うもの。
 *
 * 共有の Durable Object 名を `env` のバインディングで持たせると、cf が
 * `script_name` 付きの binding を出力して自己参照でも deploy に失敗する。
 * そのためバインディングをやめ、`ctx.exports` から直接引く。
 */
interface LoopbackExports {
  Backend: DurableObjectNamespace<Backend>;
}
