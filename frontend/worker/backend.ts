/**
 * バックエンドの Worker。コンテナを持ち、/api と /ws を振り分ける。
 *
 * フロントの Worker からサービスバインディングで呼ばれる。
 * コンテナを持つ Worker は Worker Previews に対応していないので、
 * プレビューが要る部分(静的アセット)は frontend.ts に分けてある。
 *
 * - `/api/*` と `/healthz` は転送先へ流す。転送先は KV の "target" で決まる
 *   - `ec2`        … 本番相当(EC2 + EIP、東京)
 *   - それ以外      … Cloudflare Containers(開発用・フォールバック)
 * - それ以外は静的アセット(SPA)を返す
 *
 * 画面と API を同じオリジンにすることで、プレイヤーの Cookie(`SameSite=Lax`)が
 * そのまま送られる。`workers.dev` は Public Suffix List にあるため、
 * 別サブドメインに置くと Cookie が飛ばず 401 になる。
 *
 * 転送先が落ちていても黙って他方へは流さない。セッションはメモリ上にしか無く、
 * 2 つのバックエンドで状態を共有していないので、黙って切り替わると
 * プレイヤーが別々のゲームに分裂する。壊れたら壊れたと分かるほうがよい。
 */
import {DurableObject} from "cloudflare:workers";

interface Env {
  IUBEO_SIGNING_KEY: string;
  IUBEO_WISP_KEY?: string;
  IUBEO_WISP_PASS?: string;
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

/**
 * Backend は Containers の Go サーバーを起動し、リクエストを転送する Durable Object。
 *
 * コンテナは 1 つだけ動かす(ADR-0004: セッションの状態をメモリに持つため単一プロセス)。
 */
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
          ...wispEnv(origin, this.env.IUBEO_WISP_KEY, this.env.IUBEO_WISP_PASS),
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
    // env に DO バインディングを置くと cf deploy が「別 Worker の DO」として
    // 失敗するため、自分の export へのループバック(ctx.exports)で参照する。
    // 型は `cf workers types` の生成物でないと生えないので、ここで形を宣言する
    const namespace = (ctx.exports as unknown as LoopbackExports).Backend;
    return namespace
      .getByName("game", {locationHint: "apac-ne"})
      .fetch(request);
  },
} satisfies ExportedHandler<Env>;

const wispEnv = (
  origin: string,
  key: string | undefined,
  pass: string | undefined,
): Record<string, string> => {
  if (!key || !pass) {
    return {};
  }
  const wsOrigin = origin.replace(/^http/, "ws");
  return {
    IUBEO_WISP_KEY: key,
    IUBEO_WISP_URL: `${wsOrigin}/wisp/`,
    IUBEO_WISP_PASS: pass,
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
