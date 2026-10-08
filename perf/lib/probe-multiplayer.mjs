// 実機の経路の確認: 開発サーバーのフロント(multiplayer シーン)を実サーバーにつなぎ、相手役のボット(負荷試験、-binary)と 2 人で組む。
// ブラウザが送受信した WebSocket のフレーム(テキスト / バイナリ、大きさ)と、相手のキャラクターが動いたかを見る。
// 前提: サーバー(IUBEO_MATCH_SIZE=2)が :8080、開発サーバーが :5173 で動いている
import {spawn} from "node:child_process";
import {join} from "node:path";
import {CHROME_PATH, PERF, importFromFrontend} from "./paths.mjs";

const {chromium} = await importFromFrontend("playwright-core");
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"]});
const frames = {sentText: 0, sentBin: [], recvText: 0, recvBin: []};
const errors = [];
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketFrameSent", ({response}) => { if (response.opcode === 2) frames.sentBin.push(Buffer.from(response.payloadData, "base64").length); else frames.sentText++; });
  cdp.on("Network.webSocketFrameReceived", ({response}) => { if (response.opcode === 2) frames.recvBin.push(Buffer.from(response.payloadData, "base64").length); else frames.recvText++; });
  await page.goto("http://localhost:5173/");
  await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector(".boot-overlay"), null, {timeout: 120000});
  await page.evaluate(async () => { const m = await import("/src/scenes/sceneStore.ts"); await m.sceneManager.goTo("multiplayer"); });
  await page.waitForTimeout(1500);
  // 相手役のボット(バイナリで 20Hz、円を歩く)
  const bot = spawn(join(PERF, ".tmp/loadtest"), ["-url", "http://127.0.0.1:8080", "-origin", "http://localhost:5173", "-clients", "1", "-match", "1", "-binary", "-duration", "8s", "-warmup", "1s"], {stdio: "ignore"});
  await page.waitForTimeout(4000);
  // 自分も前に歩く(自分の transform を送らせる)
  await page.keyboard.down("KeyW");
  const sample = () => page.evaluate(async () => {
    const {playerManager} = await import("/src/player/playerStore.ts");
    const st = playerManager.getState();
    const remote = st.players.find((p) => p.playerId !== st.localPlayerId);
    if (!remote) return {players: st.players.length, remote: null};
    const s = {position: {x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }}, velocity: {set() {}}, yaw: 0, pitch: 0, onGround: true};
    const ok = playerManager.sample(remote.playerId, performance.now(), s);
    return {players: st.players.length, seat: remote.seat, ok, x: s.position.x, z: s.position.z, yaw: s.yaw};
  });
  const a = await sample();
  await page.waitForTimeout(1000);
  const b = await sample();
  await page.keyboard.up("KeyW");
  await new Promise((r) => bot.on("exit", r));
  const moved = a.ok && b.ok ? Math.hypot(b.x - a.x, b.z - a.z) : null;
  const uniq = (xs) => [...new Set(xs)].join(",");
  console.log(`参加者 ${b.players} 人 / 相手の席 ${b.seat} / 相手の位置 1 秒で ${moved?.toFixed(2)} m 移動(${a.x?.toFixed(2)},${a.z?.toFixed(2)} → ${b.x?.toFixed(2)},${b.z?.toFixed(2)})`);
  console.log(`送信: バイナリ ${frames.sentBin.length} 通(大きさ ${uniq(frames.sentBin)} B)・テキスト ${frames.sentText} 通`);
  console.log(`受信: バイナリ ${frames.recvBin.length} 通(大きさ ${uniq(frames.recvBin)} B)・テキスト ${frames.recvText} 通`);
  console.log(`エラー・警告: ${errors.length ? errors.slice(0, 5).join(" / ") : "なし"}`);
} finally {
  await browser.close();
}
