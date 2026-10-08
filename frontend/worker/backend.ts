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
  /** HMAC の署名鍵(32 バイト以上)。secrets file か `cf workers secrets` で登録する */
  IUBEO_SIGNING_KEY: string;
  /** WISP 接続用トークンの署名鍵(IUBEO_WISP_KEY。WISP の Worker と同じ値。未設定なら WISP のトークンは発行しない) */
  IUBEO_WISP_KEY?: string;
  /** "target" キーに転送先("ec2" か未設定)を持つ */
  TARGET: KVNamespace;
}

/**
 * 本番相当(EC2)のオリジン。DNS は `iubeo-origin.thirdlf03.com` → EIP を DNS only で
 * 引いている。EIP は停止しても変わらないので、この値は固定でよい。
 */
const EC2_ORIGIN = "http://iubeo-origin.thirdlf03.com:8080";

/** KV のキーと、EC2 を指す値 */
const TARGET_KEY = "target";
const TARGET_EC2 = "ec2";

/** Go サーバーが待ち受けるポート(backend/internal/config の既定 :8080) */
const CONTAINER_PORT = 8080;
/** ヘルスチェックのパス(backend/api/openapi.yaml の /healthz) */
const HEALTH_PATH = "/healthz";
/**
 * これだけアクセスが無ければコンテナを眠らせる。
 *
 * コンテナは running のままアイドルでも課金される($0.074/時 = 最大 $1.78/日)。
 * 30 分だと開発中にずっと起きていて無駄なので 5 分にする。
 * WebSocket が繋がっている間はアクティブ扱いで眠らないので、プレイ中は切れない。
 */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
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
          ...wispEnv(origin, this.env.IUBEO_WISP_KEY),
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
    // KV の読み取りはエッジでキャッシュされるので、リクエストごとに引いてよい
    const target = await env.TARGET.get(TARGET_KEY);
    if (target === TARGET_EC2) {
      return proxyToEc2(request);
    }
    // env に DO バインディングを置くと cf deploy が「別 Worker の DO」として
    // 失敗するため、自分の export へのループバック(ctx.exports)で参照する。
    // 型は `cf workers types` の生成物でないと生えないので、ここで形を宣言する
    const namespace = (ctx.exports as unknown as LoopbackExports).Backend;
    // コンテナは 1 つなので、名前を固定して常に同じインスタンスに送る。
    //
    // ロケーションヒントで APAC 北東に寄せる。実測(2026-10-07)では
    // ヒント無しだと「リクエストの最寄り」に置かれ、海外から初回リクエストが
    // 来ると海外(ENAM なら mia09、WEUR なら ams17)に置かれてしまった。
    // ヒントを付けるとリージョンは確実に従う(enam→mia09, weur→ams17 を確認)。
    // 都市までは選べず、apac-ne でも大阪(kix06)になった。
    return namespace
      .getByName("game", {locationHint: "apac-ne"})
      .fetch(request);
  },
} satisfies ExportedHandler<Env>;

/**
 * WISP のトークンを発行するための設定。鍵が無ければ空(Go 側は WISP のトークンを発行しない)。
 * WebSocket の基点は、このリクエストの公開オリジンの /wisp/(ws/wss に読み替える)。
 */
const wispEnv = (
  origin: string,
  key: string | undefined,
): Record<string, string> => {
  if (!key) {
    return {};
  }
  const wsOrigin = origin.replace(/^http/, "ws");
  return {IUBEO_WISP_KEY: key, IUBEO_WISP_URL: `${wsOrigin}/wisp/`};
};

/**
 * 本番相当(EC2 + EIP)へそのまま流す。
 *
 * 向き先だけを差し替えて、メソッド・ヘッダ・ボディはそのまま渡す。
 * WebSocket への切り替えを保つため、返ってきた Response を直接返す。
 */
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
