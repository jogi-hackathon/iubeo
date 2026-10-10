// 結果の要約: 複数回の測定の中央値を、ラベルごとに並べて比べる
// 使い方: node perf/lib/summarize.mjs <baseline> [after ...]
import {existsSync, readdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {PERF} from "./paths.mjs";
import {median} from "./util.mjs";

const labels = process.argv.slice(2);
if (labels.length === 0) throw new Error("ラベルを 1 つ以上指定する");

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const runs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^browser-run-\d+\.json$/.test(f))
        .map((f) => JSON.parse(read(join(dir, f))))
    : [];
const loads = (label) =>
  readdirSync(join(PERF, "results", label))
    .filter((f) => /^load-\d+\.json$/.test(f))
    .map((f) => JSON.parse(read(join(PERF, "results", label, f))));

/** Go ベンチの出力(BenchmarkX-10  N  ns/op  B/op  allocs/op)を名前ごとの中央値にする */
const goBench = (label) => {
  const txt = read(join(PERF, "results", label, "go-bench.txt"));
  if (!txt) return {};
  const by = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^(Benchmark\S+?)-\d+\s+\d+\s+([\d.]+) ns\/op\s+(\d+) B\/op\s+(\d+) allocs\/op/);
    if (!m) continue;
    (by[m[1]] ??= {ns: [], b: [], allocs: []});
    by[m[1]].ns.push(Number(m[2]));
    by[m[1]].b.push(Number(m[3]));
    by[m[1]].allocs.push(Number(m[4]));
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, {ns: median(v.ns), b: median(v.b), allocs: median(v.allocs)}]));
};

const collect = (label) => {
  const base = join(PERF, "results", label);
  const bundle = JSON.parse(read(join(base, "bundle.json")) ?? "{}");
  const js = Object.entries(bundle.files ?? {}).find(([f]) => f.endsWith(".js"))?.[1] ?? {};
  const buildSecs = (read(join(base, "build-seconds.txt")) ?? "").trim().split("\n").map(Number).filter((x) => x > 0);
  const desktop = runs(join(base, "desktop"));
  const moved = runs(join(base, "uncapped-move"));
  const slow = runs(join(base, "regular4g-cpu4"));
  const repeat = runs(join(base, "repeat-regular4g-cpu4"));
  const ld = loads(label);
  const g = goBench(label);
  const pick = (arr, f) => median(arr.map(f));
  return {
    jsRawKB: js.raw / 1024,
    jsGzipKB: js.gzip / 1024,
    jsBrotliKB: js.brotli / 1024,
    buildS: median(buildSecs),
    desktopBootGoneMs: pick(desktop, (r) => r.bootGoneMs),
    desktopReadyMs: pick(desktop, (r) => r.readyMs),
    desktopTransferKB: pick(desktop, (r) => r.transfer.jsBytes / 1024),
    desktopHeapMB: pick(desktop, (r) => r.cdp.jsHeapUsedMB),
    capFps: pick(desktop, (r) => r.fps),
    movedFrameP50Ms: pick(moved, (r) => r.frame.p50Ms),
    movedFrameP95Ms: pick(moved, (r) => r.frame.p95Ms),
    movedFps: pick(moved, (r) => r.fps),
    slowBootGoneMs: pick(slow, (r) => r.bootGoneMs),
    slowReadyMs: pick(slow, (r) => r.readyMs),
    repeatBootGoneMs: pick(repeat, (r) => r.bootGoneMs),
    repeatReadyMs: pick(repeat, (r) => r.readyMs),
    loadRttP50: pick(ld, (r) => r.rtt_ms.p50),
    loadRttP95: pick(ld, (r) => r.rtt_ms.p95),
    loadTickP95: pick(ld, (r) => r.tick_interval_ms.p95),
    loadMsgPerSec: pick(ld, (r) => r.messages_per_sec),
    loadDisconnects: ld.reduce((a, r) => a + r.disconnects, 0),
    goBench: g,
    counts: {desktop: desktop.length, moved: moved.length, slow: slow.length, load: ld.length},
  };
};

const data = Object.fromEntries(labels.map((l) => [l, collect(l)]));
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "-");
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && a !== 0 ? `${(((b - a) / a) * 100).toFixed(1)}%` : "");

const rows = [
  ["JS raw (KB)", (d) => f(d.jsRawKB), (d) => d.jsRawKB],
  ["JS gzip (KB)", (d) => f(d.jsGzipKB), (d) => d.jsGzipKB],
  ["JS brotli (KB)", (d) => f(d.jsBrotliKB), (d) => d.jsBrotliKB],
  ["JS 転送量 brotli(KB, 実測)", (d) => f(d.desktopTransferKB), (d) => d.desktopTransferKB],
  ["ビルド時間(秒, 中央値)", (d) => f(d.buildS, 2), (d) => d.buildS],
  ["起動画面が消える(ms, 通常)", (d) => f(d.desktopBootGoneMs, 0), (d) => d.desktopBootGoneMs],
  ["操作できる(ms, 通常)", (d) => f(d.desktopReadyMs, 0), (d) => d.desktopReadyMs],
  ["操作できる(ms, 4G+CPU4x)", (d) => f(d.slowReadyMs, 0), (d) => d.slowReadyMs],
  ["起動画面が消える(ms, 4G+CPU4x)", (d) => f(d.slowBootGoneMs, 0), (d) => d.slowBootGoneMs],
  ["再訪: 起動画面が消える(ms, 4G+CPU4x)", (d) => f(d.repeatBootGoneMs, 0), (d) => d.repeatBootGoneMs],
  ["再訪: 操作できる(ms, 4G+CPU4x)", (d) => f(d.repeatReadyMs, 0), (d) => d.repeatReadyMs],
  ["JS ヒープ(MB)", (d) => f(d.desktopHeapMB), (d) => d.desktopHeapMB],
  ["フレーム p50 (ms, 上限なし・前進)", (d) => f(d.movedFrameP50Ms, 2), (d) => d.movedFrameP50Ms],
  ["フレーム p95 (ms, 上限なし・前進)", (d) => f(d.movedFrameP95Ms, 2), (d) => d.movedFrameP95Ms],
  ["fps (上限なし・前進)", (d) => f(d.movedFps, 0), (d) => d.movedFps],
  ["負荷: RTT p50 (ms)", (d) => f(d.loadRttP50), (d) => d.loadRttP50],
  ["負荷: RTT p95 (ms)", (d) => f(d.loadRttP95), (d) => d.loadRttP95],
  ["負荷: 配信間隔 p95 (ms, 目標50)", (d) => f(d.loadTickP95), (d) => d.loadTickP95],
  ["負荷: 配信数/秒", (d) => f(d.loadMsgPerSec, 0), (d) => d.loadMsgPerSec],
  ["負荷: 切断(合計)", (d) => String(d.loadDisconnects), (d) => d.loadDisconnects],
];

const out = [];
out.push(`| 指標 | ${labels.join(" | ")} |${labels.length > 1 ? " 変化(最後/最初) |" : ""}`);
out.push(`|---|${labels.map(() => "---:").join("|")}|${labels.length > 1 ? "---:|" : ""}`);
for (const [name, fmt, raw] of rows) {
  const vals = labels.map((l) => fmt(data[l]));
  const change = labels.length > 1 ? ` ${pct(raw(data[labels[0]]), raw(data[labels[labels.length - 1]]))} |` : "";
  out.push(`| ${name} | ${vals.join(" | ")} |${change}`);
}
const benchNames = [...new Set(labels.flatMap((l) => Object.keys(data[l].goBench)))];
out.push("", "| Go ベンチ | " + labels.map((l) => `${l} ns/op (B/op, allocs)`).join(" | ") + " |");
out.push("|---|" + labels.map(() => "---:").join("|") + "|");
for (const n of benchNames) {
  const cells = labels.map((l) => {
    const b = data[l].goBench[n];
    return b ? `${f(b.ns, 0)} (${b.b}, ${b.allocs})` : "-";
  });
  out.push(`| ${n} | ${cells.join(" | ")} |`);
}
out.push("", "各値は実行回数の中央値。回数: " + labels.map((l) => `${l}=通常${data[l].counts.desktop}/上限なし${data[l].counts.moved}/4G${data[l].counts.slow}/負荷${data[l].counts.load}`).join(", "));

const text = out.join("\n") + "\n";
console.log(text);
if (labels.length === 1) writeFileSync(join(PERF, "results", labels[0], "summary.md"), text);
