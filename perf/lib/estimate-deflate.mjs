// WebSocket の圧縮(permessage-deflate、文脈を引き継ぐ)で、JSON のままどこまで減るかの試算
import {constants, createDeflateRaw} from "node:zlib";
const ids = ["5L55NTOIVBPG55XOF5XEKB44QE", "HOPLLDAFVAO4DB2J6TU5WWBN5S", "JQJ65NEH3HVGVCTR54MISWWEBG"];
const pos = ids.map(() => ({x: Math.random() * 20 - 10, z: Math.random() * 20 - 10, yaw: 0, seq: 100}));
const msgAt = (t) => {
  pos.forEach((p, i) => { p.x += Math.cos(t * 0.3 + i) * 0.12; p.z += Math.sin(t * 0.3 + i) * 0.12; p.yaw += 0.05; p.seq++; });
  return JSON.stringify({type: "transforms", serverTime: new Date(1791400000000 + t * 50).toISOString().replace("Z", "123456+09:00"),
    players: pos.map((p, i) => ({playerId: ids[i], transform: {position: [p.x, 0, p.z], yaw: p.yaw, pitch: -0.12, seq: p.seq}}))});
};
const run = (level, windowBits) => new Promise((resolve) => {
  const z = createDeflateRaw({level, windowBits});
  let total = 0, raw = 0, n = 0;
  z.on("data", (c) => { total += c.length; });
  const step = (t) => {
    if (t >= 400) { resolve({avg: total / n, raw: raw / n}); return; }
    const m = msgAt(t); raw += m.length; n++;
    z.write(m); z.flush(constants.Z_SYNC_FLUSH, () => step(t + 1));
  };
  step(0);
});
for (const [level, bits] of [[1, 15], [6, 15], [6, 11]]) {
  const r = await run(level, bits);
  // permessage-deflate は末尾の 00 00 ff ff(4 B)を送らない
  console.log(`deflate level=${level} window=2^${bits}: JSON ${r.raw.toFixed(0)} B → ${(r.avg - 4).toFixed(0)} B / 通`);
}
