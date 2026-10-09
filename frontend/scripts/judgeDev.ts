import type {ServerResponse} from "node:http";

import type {Plugin} from "vite";

import type {JudgeResult} from "../src/judge/types.ts";

/**
 * 手元の開発サーバーに `/judge` を生やす。
 *
 * 本番はフロントの Worker（worker/judge.ts）が Workers AI の Clef を呼ぶが、開発時は
 * Worker を動かさない（vite.config.ts の方針）。Clef は Cloudflare 上でしか動かないので、
 * 手元では**常に一致を返す**ことにして、本番と同じ経路（同じオリジンの /judge）だけを再現する。
 * 判定が通るので、検索の成果物（searchDeliverable）の流れもそのまま試せる。
 *
 * 本物の Clef を手元で試したいときは、Worker を動かす環境（`pnpm cf:build && pnpm preview`
 * など）で確認する。
 */

/** 判定のパス（worker/judge.ts と揃える） */
export const JUDGE_PATH = "/judge";

/** 開発用の判定。お題を見ずに常に「一致」で通す（source で区別できるようにしておく） */
const devResult = (): JudgeResult => ({
  verdict: "match",
  score: 1,
  confidence: 1,
  reasons: ["開発用の判定です（常に一致）"],
  source: "dev",
});

export const judgeDevPlugin = (): Plugin => ({
  name: "iubeo-judge",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = req.url
        ? new URL(req.url, "http://localhost").pathname
        : "";
      if (pathname !== JUDGE_PATH || req.method !== "POST") {
        next();
        return;
      }
      send(res, devResult(), 200);
    });
  },
});

const send = (res: ServerResponse, body: unknown, status: number): void => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};
