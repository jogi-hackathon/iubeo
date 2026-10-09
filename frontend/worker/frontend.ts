/**
 * フロントの Worker。静的アセット(SPA)を配信し、/api と /ws は
 * バックエンドの Worker へ、/wisp は WISP の Worker へそのまま流す。
 * Web Search の判定(/judge)は、Workers AI の Clef を呼ぶこの Worker が自分で受ける。
 *
 * コンテナを持たないので **Worker Previews が使える**(PR ごとのプレビュー URL)。
 * 画面と API を同じオリジンにするのもこの Worker の役目で、これにより
 * プレイヤーの Cookie(SameSite=Lax)がそのまま送られる。
 */
import {handleJudge, JUDGE_PATH} from "./judge";

interface Env {
  ASSETS: Fetcher;
  /** サービスバインディング。バックエンドの Worker */
  BACKEND: Fetcher;
  /**
   * サービスバインディング。WISP の Worker(実サイトへ出るプロキシ。トークンで保護)。
   * WISP を deploy していない環境（PR のプレビューなど）では無い。その場合 /wisp は 503
   */
  WISP?: Fetcher;
  /** Web Search の判定(Clef)に使う Workers AI の binding。無ければ /judge は 503 */
  AI?: Ai;
  /** /judge の IP ごとの回数の上限。無ければ絞らない */
  JUDGE_IP_LIMIT?: RateLimit;
  /** /judge の全体の回数の上限。無ければ絞らない */
  JUDGE_GLOBAL_LIMIT?: RateLimit;
}

/** ヘルスチェックのパス(backend/api/openapi.yaml の /healthz) */
const HEALTH_PATH = "/healthz";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const {pathname} = new URL(request.url);
    // assets.runWorkerFirst で /api/* と /healthz と /judge だけここに来る。
    // それ以外(アセットに一致しなかったパス)は SPA として index.html を返す。
    if (pathname.startsWith("/api/") || pathname === HEALTH_PATH) {
      return env.BACKEND.fetch(request);
    }
    if (pathname === JUDGE_PATH) {
      return handleJudge(request, env);
    }
    if (pathname === "/wisp" || pathname.startsWith("/wisp/")) {
      if (!env.WISP) {
        return Response.json({error: "wisp is not deployed"}, {status: 503});
      }
      return env.WISP.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
