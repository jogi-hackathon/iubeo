import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import {extname, join, normalize} from "node:path";
import {brotliCompressSync, constants, gzipSync} from "node:zlib";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".bin": "application/octet-stream",
  ".svg": "image/svg+xml",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);
const DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

const compressedCache = new Map();
const compressed = (key, body, encoding) => {
  const k = `${key}|${encoding}`;
  if (!compressedCache.has(k)) {
    compressedCache.set(
      k,
      encoding === "br"
        ? brotliCompressSync(body, {params: {[constants.BROTLI_PARAM_QUALITY]: 11}})
        : gzipSync(body, {level: 9}),
    );
  }
  return compressedCache.get(k);
};

const loadHeaderRules = async (root) => {
  let text;
  try {
    text = await readFile(join(root, "_headers"), "utf8");
  } catch {
    return [];
  }
  const rules = [];
  let current = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      const pattern = raw.trim();
      current = pattern.endsWith("*")
        ? {prefix: pattern.slice(0, -1), headers: {}}
        : {exact: pattern, headers: {}};
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(":");
      if (i > 0) current.headers[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
};

export const serveDir = async (root, port = 0, {engineDir = process.env.PERF_ENGINE_DIR} = {}) => {
  const rules = await loadHeaderRules(root);
  const noCache = process.env.PERF_NO_CACHE === "1";
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (engineDir && pathname.startsWith("/engine/")) {
        const file = normalize(join(engineDir, pathname.slice("/engine/".length)));
        try {
          if (!file.startsWith(engineDir)) throw new Error("outside engine dir");
          const raw = await readFile(file);
          const headers = {
            "content-type": TYPES[extname(file)] ?? "application/octet-stream",
            "cache-control": "public, max-age=3600",
            "cross-origin-resource-policy": "cross-origin",
          };
          let body = raw;
          if (process.env.PERF_ENGINE_COMPRESS === "1" && COMPRESSIBLE.has(extname(file))) {
            const accept = String(req.headers["accept-encoding"] ?? "");
            const enc = accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : null;
            if (enc) {
              body = compressed(file, raw, enc);
              headers["content-encoding"] = enc;
            }
          }
          res.writeHead(200, headers);
          res.end(req.method === "HEAD" ? undefined : body);
        } catch {
          res.writeHead(404).end();
        }
        return;
      }
      let file = normalize(join(root, pathname));
      if (!file.startsWith(root) || pathname === "/_headers") {
        file = join(root, "index.html");
      }
      try {
        const st = await stat(file);
        if (st.isDirectory()) file = join(file, "index.html");
      } catch {
        file = join(root, "index.html");
      }
      try {
        const raw = await readFile(file);
        const etag = `"${createHash("sha1").update(raw).digest("hex").slice(0, 20)}"`;
        const headers = {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          "cache-control": noCache ? "no-store" : DEFAULT_CACHE_CONTROL,
          etag,
          vary: "Accept-Encoding",
        };
        if (!noCache) {
          for (const r of rules) {
            if (r.exact === pathname || (r.prefix !== undefined && pathname.startsWith(r.prefix))) {
              Object.assign(headers, r.headers);
            }
          }
          if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, headers);
            res.end();
            return;
          }
        }
        let body = raw;
        const accept = String(req.headers["accept-encoding"] ?? "");
        if (COMPRESSIBLE.has(extname(file))) {
          const enc = accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : null;
          if (enc) {
            body = compressed(file, raw, enc);
            headers["content-encoding"] = enc;
          }
        }
        res.writeHead(200, headers);
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(port, "127.0.0.1", () => {
      const {port: p} = server.address();
      resolve({url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(r))});
    });
  });
};
