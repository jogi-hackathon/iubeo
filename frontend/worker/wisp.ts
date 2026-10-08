/**
 * WISP の Worker。実サイトへ出るプロキシ（wisp-js を載せた Container）への入口。
 *
 * - フロントの Worker が `/wisp/*` をこの Worker へ転送する（同じオリジンになり、Cookie の心配が要らない）
 * - `?token=` のトークンを検証してから、Container へ流す。トークンは backend が発行する（api の /api/v1/wisp/token）
 * - Container は外へ出るため `enableInternet: true`。wisp-js の既定で、ローカル・私設の宛先は拒否される
 *
 * トークンが無い・壊れている・期限切れは 401。鍵が未設定なら検証できないので 503。
 */
import {DurableObject} from "cloudflare:workers";

import {verifyWispToken} from "./wispToken";

interface Env {
  /** トークンの検証鍵（IUBEO_WISP_KEY。バックエンドと同じ値。32 バイト以上） */
  WISP_KEY: string;
}

/** Container の中で wisp-js が待ち受けるポート（wisp/server.mjs） */
const CONTAINER_PORT = 8080;
/** これだけ使われなければ Container を眠らせる（バックエンドと同じ考え方） */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
/** Container の起動を待つ最大時間 */
const START_TIMEOUT_MS = 90_000;
/** 転送先の状態を見る用（wisp-js の server は GET / に 200 を返す） */
const HEALTH_PATH = "/";

/** 1 つの Container を名前で固定して使う（単一プロセス。接続は WISP のストリームで多重化される） */
const CONTAINER_NAME = "wisp";

/**
 * Container を起動し、WISP の接続を転送する Durable Object。
 */
export class Wisp extends DurableObject<Env> {
  private starting: Promise<void> | undefined;

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWait().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    // トークンは検証に使い終わったので、Container へは渡さない
    url.searchParams.delete("token");
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    // WebSocket への切り替えを保つため、そのまま返す
    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }

  private async startAndWait(): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      const image = container.images.base;
      if (!image) {
        throw new Error("コンテナのイメージが見つからない");
      }
      container.start({
        image,
        // 外の Web サイトへ出るため、インターネットへの通信を許す
        enableInternet: true,
        env: {},
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
    if (!env.WISP_KEY) {
      return json({error: "wisp is not configured"}, 503);
    }
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const playerId = await verifyWispToken(token, env.WISP_KEY);
    if (playerId === null) {
      return json({error: "invalid or expired token"}, 401);
    }
    // env に DO のバインディングを置くと cf deploy が失敗するため、自分の export へのループバックで引く
    // （backend.ts と同じ理由）
    const namespace = (ctx.exports as unknown as LoopbackExports).Wisp;
    return namespace.getByName(CONTAINER_NAME).fetch(request);
  },
} satisfies ExportedHandler<Env>;

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });

interface LoopbackExports {
  Wisp: DurableObjectNamespace<Wisp>;
}
