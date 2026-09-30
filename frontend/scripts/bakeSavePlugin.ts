import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import type {Plugin} from "vite";

import {
  BAKE_SAVE_PATH,
  type BakeSaveMeta,
  bakedAOFiles,
  SCENE_NAME_RE,
} from "../src/bake/paths.ts";
import {encodePNGGray8} from "./png.ts";

/**
 * dev サーバー専用。ベイクページから POST された結果を public/ao/<scene>.png / .bin に書き出す。
 * body = アトラスのバイト列(atlasW*atlasH、グレースケール) + レイアウト
 */
export const bakeSavePlugin = (): Plugin => ({
  name: "iubeo-bake-save",
  apply: "serve",
  configureServer(server) {
    const publicDir = server.config.publicDir;
    server.middlewares.use(BAKE_SAVE_PATH, (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST only");
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try {
          const header = req.headers["x-bake-meta"];
          if (typeof header !== "string") {
            throw new Error("X-Bake-Meta がありません");
          }
          const meta = JSON.parse(decodeURIComponent(header)) as BakeSaveMeta;
          if (
            typeof meta.scene !== "string" ||
            !SCENE_NAME_RE.test(meta.scene)
          ) {
            throw new Error(`シーン名が不正です: ${meta.scene}`);
          }
          const isSize = (v: unknown) =>
            Number.isInteger(v) && (v as number) > 0 && (v as number) <= 0xffff;
          if (!isSize(meta.atlasW) || !isSize(meta.atlasH)) {
            throw new Error(
              `アトラスサイズが不正です: ${meta.atlasW}x${meta.atlasH}`,
            );
          }
          if (!Number.isInteger(meta.layoutLength) || meta.layoutLength < 0) {
            throw new Error(`レイアウト長が不正です: ${meta.layoutLength}`);
          }
          const body = Buffer.concat(chunks);
          const atlasLength = meta.atlasW * meta.atlasH;
          if (body.length !== atlasLength + meta.layoutLength) {
            throw new Error(
              `body の長さが一致しません: ${body.length} != ${atlasLength} + ${meta.layoutLength}`,
            );
          }
          const files = bakedAOFiles(meta.scene);
          const atlasPath = resolve(publicDir, files.atlas);
          const layoutPath = resolve(publicDir, files.layout);
          mkdirSync(dirname(atlasPath), {recursive: true});
          writeFileSync(
            atlasPath,
            encodePNGGray8(
              meta.atlasW,
              meta.atlasH,
              body.subarray(0, atlasLength),
            ),
          );
          writeFileSync(layoutPath, body.subarray(atlasLength));
          server.config.logger.info(
            `[bake] wrote ${atlasPath} (${meta.atlasW}x${meta.atlasH}), ${layoutPath}`,
          );
          res.statusCode = 200;
          res.end("ok");
        } catch (e) {
          server.config.logger.error(`[bake] save failed: ${String(e)}`);
          res.statusCode = 500;
          res.end(e instanceof Error ? e.message : String(e));
        }
      });
    });
  },
});
