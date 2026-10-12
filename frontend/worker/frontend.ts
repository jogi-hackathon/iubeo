import {handleJudge, JUDGE_PATH} from "./judge";

interface Env {
  ASSETS: Fetcher;
  BACKEND: Fetcher;
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
