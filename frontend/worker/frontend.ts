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
  AI?: Ai;
  JUDGE_IP_LIMIT?: RateLimit;
  JUDGE_GLOBAL_LIMIT?: RateLimit;
}

const HEALTH_PATH = "/healthz";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const {pathname} = new URL(request.url);
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
