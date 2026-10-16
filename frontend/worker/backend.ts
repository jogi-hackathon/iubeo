import {DurableObject} from "cloudflare:workers";

interface Env {
  IUBEO_SIGNING_KEY: string;
  IUBEO_WISP_KEY?: string;
  IUBEO_ALLOWED_ORIGIN_PATTERNS?: string;
  IUBEO_VC_PRIVATE_KEY?: string;
  IUBEO_VC_SIGNALING_URL?: string;
  IUBEO_VC_MEDIA_URL?: string;
  TARGET: KVNamespace;
}

const EC2_ORIGIN = "http://iubeo-origin.thirdlf03.com:8080";

const TARGET_KEY = "target";
const TARGET_EC2 = "ec2";

const CONTAINER_PORT = 8080;
const HEALTH_PATH = "/healthz";
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const START_TIMEOUT_MS = 90_000;
const INSTANCE = "standard-1";

export class Backend extends DurableObject<Env> {
  private starting: Promise<void> | undefined;

  async fetch(request: Request): Promise<Response> {
    const origin = new URL(request.url).origin;

    this.starting ??= this.startAndWait(origin).finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);
  }

  private async startAndWait(origin: string): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
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
        enableInternet: false,
        env: {
          IUBEO_ADDR: `:${CONTAINER_PORT}`,
          IUBEO_SIGNING_KEY: key,
          IUBEO_ALLOWED_ORIGINS: origin,
          IUBEO_MATCH_SIZE: "3",
          // 展示では 1 試合を短くする(既定は 5 フェーズ × 45s、間 8s、バイパス 30s)
          IUBEO_PHASE_COUNT: "3",
          IUBEO_PHASE_DURATION: "30s",
          IUBEO_INTERMISSION_DURATION: "5s",
          IUBEO_BYPASS_DURATION: "20s",
          ...originPatternEnv(this.env.IUBEO_ALLOWED_ORIGIN_PATTERNS),
          ...wispEnv(origin, this.env.IUBEO_WISP_KEY),
          ...voiceEnv(this.env),
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
    const target = await env.TARGET.get(TARGET_KEY);
    if (target === TARGET_EC2) {
      return proxyToEc2(request);
    }
    const namespace = (ctx.exports as unknown as LoopbackExports).Backend;
    return namespace
      .getByName("game", {locationHint: "apac-ne"})
      .fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Worker の env はコンテナへ自動で渡らないため、ここで明示的に載せる */
const voiceEnv = (env: Env): Record<string, string> => {
  const {IUBEO_VC_PRIVATE_KEY: key} = env;
  const signaling = env.IUBEO_VC_SIGNALING_URL;
  const media = env.IUBEO_VC_MEDIA_URL;
  if (!key || !signaling || !media) {
    return {};
  }
  return {
    IUBEO_VC_PRIVATE_KEY: key,
    IUBEO_VC_SIGNALING_URL: signaling,
    IUBEO_VC_MEDIA_URL: media,
  };
};

/**
 * 正規表現で許可する Origin(展示用の PR プレビュー等)。空なら何も渡さない
 */
const originPatternEnv = (
  patterns: string | undefined,
): Record<string, string> =>
  patterns ? {IUBEO_ALLOWED_ORIGIN_PATTERNS: patterns} : {};

const wispEnv = (
  origin: string,
  key: string | undefined,
): Record<string, string> => {
  if (!key) {
    return {};
  }
  const wsOrigin = origin.replace(/^http/, "ws");
  return {
    IUBEO_WISP_KEY: key,
    IUBEO_WISP_URL: `${wsOrigin}/wisp/`,
  };
};

async function proxyToEc2(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = new URL(EC2_ORIGIN);
  url.protocol = origin.protocol;
  url.host = origin.host;
  const forwarded = new Request(url, request);
  forwarded.headers.delete("host");
  return fetch(forwarded);
}

interface LoopbackExports {
  Backend: DurableObjectNamespace<Backend>;
}
