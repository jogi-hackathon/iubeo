import type {ServerResponse} from "node:http";

import type {Plugin} from "vite";

import type {JudgeResult} from "../src/judge/types.ts";

/** 判定のパス（worker/judge.ts と揃える） */
export const JUDGE_PATH = "/judge";

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
