// バンドルの計測: 生・gzip・brotli のサイズと、ソースのパッケージごとの内訳(sourcemap から集計)
// 使い方: node perf/lib/bundle-report.mjs [assetsDir]
import {brotliCompressSync, constants, gzipSync} from "node:zlib";
import {readdirSync, readFileSync, statSync} from "node:fs";
import {createRequire} from "node:module";
import {join} from "node:path";
import {DIST, FRONTEND} from "./paths.mjs";

const dir = process.argv[2] ?? join(DIST, "assets");
const req = createRequire(join(FRONTEND, "package.json"));
const traceMappingPath = join(
  FRONTEND,
  "node_modules/.pnpm/@jridgewell+trace-mapping@0.3.31/node_modules/@jridgewell/trace-mapping/dist/trace-mapping.umd.js",
);
const {TraceMap, eachMapping} = req(traceMappingPath);

const sizes = (buf) => ({
  raw: buf.length,
  gzip: gzipSync(buf, {level: 9}).length,
  brotli: brotliCompressSync(buf, {
    params: {[constants.BROTLI_PARAM_QUALITY]: 11},
  }).length,
});

/** ソースのパスを内訳の単位(パッケージ名 or src 配下のフォルダ)に直す */
const bucketOf = (source) => {
  if (!source) return "(none)";
  const nm = source.lastIndexOf("node_modules/");
  if (nm >= 0) {
    const rest = source.slice(nm + "node_modules/".length).split("/");
    const pkg = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
    // PERF_DEEP=1 のとき three は src 配下のフォルダまで分ける(どの機能が重いかを見る)
    if (process.env.PERF_DEEP && pkg === "three") {
      const i = rest.indexOf("src");
      const sub = i >= 0 ? rest.slice(i + 1, i + 3).join("/") : rest.slice(-3).join("/");
      return `three:${sub}`;
    }
    return pkg;
  }
  const m = source.match(/src\/([^/]+)/);
  return m ? `src/${m[1]}` : source;
};

const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
const report = {files: {}, composition: {}};
for (const f of files) {
  const buf = readFileSync(join(dir, f));
  report.files[f] = {bytes: statSync(join(dir, f)).size, ...sizes(buf)};
}

// JS の内訳: 生成コードの各行を、そのセグメントのソースに割り当てる(近似)
const jsFile = files.find((f) => f.endsWith(".js") && !f.endsWith(".map"));
if (jsFile) {
  const code = readFileSync(join(dir, jsFile), "utf8");
  const lines = code.split("\n");
  const mapPath = join(dir, `${jsFile}.map`);
  const map = new TraceMap(readFileSync(mapPath, "utf8"));
  const segs = new Map(); // line -> [{col, source}]
  eachMapping(map, (m) => {
    if (m.source == null) return;
    if (!segs.has(m.generatedLine)) segs.set(m.generatedLine, []);
    segs.get(m.generatedLine).push({col: m.generatedColumn, source: m.source});
  });
  const comp = {};
  lines.forEach((line, i) => {
    const s = (segs.get(i + 1) ?? []).sort((a, b) => a.col - b.col);
    if (s.length === 0) {
      comp["(unmapped)"] = (comp["(unmapped)"] ?? 0) + line.length + 1;
      return;
    }
    for (let k = 0; k < s.length; k++) {
      const end = k + 1 < s.length ? s[k + 1].col : line.length;
      const bucket = bucketOf(s[k].source);
      comp[bucket] = (comp[bucket] ?? 0) + Math.max(0, end - s[k].col);
    }
    if (s[0].col > 0) comp["(unmapped)"] = (comp["(unmapped)"] ?? 0) + s[0].col;
  });
  report.composition = Object.fromEntries(
    Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 25),
  );
  report.jsFile = jsFile;
}

console.log(JSON.stringify(report, null, 2));
