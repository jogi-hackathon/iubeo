/**
 * WISP の Worker。実サイトへ出るプロキシへの入口。
 *
 * - フロントの Worker が `/wisp/*` をこの Worker へ転送する（同じオリジンになり、Cookie の心配が要らない）
 * - 転送先は KV の "target" で切り替わる(backend.ts と同じ仕組み):
 *   - "ec2" なら EC2 上の WISP(8081)へ流す。出口は EIP になるので、
 *     Cloudflare のコンテナ(共有の出口IP)で出る Google の reCAPTCHA を避けられる
 *   - それ以外は `?token=` を検証してから Cloudflare のコンテナへ流す
 *     （トークンは backend が発行する。api の /api/v1/wisp/token）
 * - Container は外へ出るため `enableInternet: true`。wisp-js の既定で、ローカル・私設の宛先は拒否される
 *
 * トークンが無い・壊れている・期限切れは 401。鍵が未設定なら検証できないので 503。
 */
import {DurableObject} from "cloudflare:workers";

import {tokenFromUrl, verifyWispToken} from "./wispToken";

interface Env {
  WISP_KEY: string;
  TARGET: KVNamespace;
}

/** Container の中で wisp-js が待ち受けるポート（wisp/server.mjs） */
const CONTAINER_PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INSTANCE = "standard-1";
const START_TIMEOUT_MS = 90_000;
/** 転送先の状態を見る用（wisp-js の server は GET / に 200 を返す） */
const HEALTH_PATH = "/";

const CONTAINER_NAME = "wisp";

const TARGET_KEY = "target";
const TARGET_EC2 = "ec2";
const EC2_WISP_ORIGIN = "http://iubeo-origin.thirdlf03.com:8081";

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
    url.searchParams.delete("token");
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
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
        enableInternet: true,
        instance: INSTANCE,
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
    if ((await env.TARGET.get(TARGET_KEY)) === TARGET_EC2) {
      const url = new URL(request.url);
      url.protocol = "http:";
      url.host = new URL(EC2_WISP_ORIGIN).host;
      const forwarded = new Request(url, request);
      forwarded.headers.delete("host");
      return fetch(forwarded);
    }

    if (!env.WISP_KEY) {
      return json({error: "wisp is not configured"}, 503);
    }
    const token = tokenFromUrl(request.url);
    const playerId = await verifyWispToken(token, env.WISP_KEY);
    if (playerId === null) {
      return json({error: "invalid or expired token"}, 401);
    }
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
