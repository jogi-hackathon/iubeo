import {DurableObject} from "cloudflare:workers";

import {tokenFromUrl, verifyWispToken} from "./wispToken";

interface Env {
  WISP_KEY: string;
  TARGET: KVNamespace;
}

const CONTAINER_PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INSTANCE = "standard-1";
const START_TIMEOUT_MS = 90_000;
const HEALTH_PATH = "/";

const CONTAINER_NAME = "wisp";

const TARGET_KEY = "target";
const TARGET_EC2 = "ec2";
const EC2_WISP_ORIGIN = "http://iubeo-origin.thirdlf03.com:8081";

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
