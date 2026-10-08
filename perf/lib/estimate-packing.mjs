// 位置のメッセージをどこまで詰められるかの試算(v1 = 試作済み、v2 = さらに詰めた案)。サイズと量子化の誤差を実測する
const N = 3, HZ = 20;
// v2: 種別 u8 | 席のビットマスク u8(含まれる席) | 席の順に n × (seq u16 | x y z i16(1/256 m) | yaw u16(2π/65536) | pitch i16(π/2/32767))
//     serverTime は送らない(フロントは使っていない)。席はビットマスクで表し、1 人あたりの席の 1 B を省く
const POS = 256, YAW = 65536 / (2 * Math.PI), PITCH = 32767 / (Math.PI / 2);
const enc2 = (players) => {
  const b = new DataView(new ArrayBuffer(2 + 12 * players.length));
  b.setUint8(0, 2);
  let mask = 0; for (const p of players) mask |= 1 << (p.seat - 1);
  b.setUint8(1, mask);
  let o = 2;
  for (const p of [...players].sort((a, c) => a.seat - c.seat)) {
    b.setUint16(o, p.seq & 0xffff, true);
    b.setInt16(o + 2, Math.round(p.x * POS), true); b.setInt16(o + 4, Math.round(p.y * POS), true); b.setInt16(o + 6, Math.round(p.z * POS), true);
    const yaw = ((p.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    b.setUint16(o + 8, Math.round(yaw * YAW) & 0xffff, true);
    b.setInt16(o + 10, Math.round(p.pitch * PITCH), true);
    o += 12;
  }
  return b;
};
const dec2 = (b) => {
  const mask = b.getUint8(1); const out = []; let o = 2;
  for (let s = 1; s <= 8; s++) if (mask & (1 << (s - 1))) {
    out.push({seat: s, seq: b.getUint16(o, true), x: b.getInt16(o + 2, true) / POS, y: b.getInt16(o + 4, true) / POS, z: b.getInt16(o + 6, true) / POS,
      yaw: b.getUint16(o + 8, true) / YAW, pitch: b.getInt16(o + 10, true) / PITCH}); o += 12;
  }
  return out;
};
// 実際に近い動き: 床(±100 m)の上を歩く・跳ぶ・見回す
let maxPos = 0, maxYawDeg = 0, maxPitchDeg = 0, seqOk = true, size = 0;
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
for (let i = 0; i < 100000; i++) {
  const players = Array.from({length: N}, (_, k) => ({seat: k + 1, seq: 65530 + i + k,
    x: (Math.random() * 2 - 1) * 100, y: Math.random() * 3, z: (Math.random() * 2 - 1) * 100,
    yaw: (Math.random() * 2 - 1) * 10, pitch: (Math.random() * 2 - 1) * Math.PI / 2}));
  const b = enc2(players); size = b.byteLength;
  const d = dec2(b);
  d.forEach((q, k) => {
    const p = players[k];
    maxPos = Math.max(maxPos, Math.abs(q.x - p.x), Math.abs(q.y - p.y), Math.abs(q.z - p.z));
    maxYawDeg = Math.max(maxYawDeg, angDiff(q.yaw, p.yaw) * 180 / Math.PI);
    maxPitchDeg = Math.max(maxPitchDeg, Math.abs(q.pitch - p.pitch) * 180 / Math.PI);
    if (q.seq !== (p.seq & 0xffff)) seqOk = false;
  });
}
console.log(`v2 の transforms(3 人): ${size} B / 最大誤差 位置 ${(maxPos * 1000).toFixed(2)} mm・yaw ${maxYawDeg.toFixed(4)}°・pitch ${maxPitchDeg.toFixed(4)}° / seq ${seqOk ? "OK" : "NG"}`);
// 回線上の量(1 クライアント、20Hz)。ヘッダ: WebSocket 下り 2 B・上り 6 B、TLS 1.3 のレコード 22 B、TCP/IPv4(タイムスタンプ付き)52 B
const wire = (payload, ws) => payload + ws + 22 + 52;
const rows = [["JSON(今)", 456, 89], ["v1(試作済み)", 85, 25], ["v2(さらに詰めた案)", size, 13]];
for (const [name, down, up] of rows) {
  console.log(`${name.padEnd(14)} 下り ペイロード ${String(down).padStart(3)} B → 回線 ${(wire(down, 2) * HZ / 1000).toFixed(2)} KB/秒 / 上り ペイロード ${String(up).padStart(3)} B → 回線 ${(wire(up, 6) * HZ / 1000).toFixed(2)} KB/秒`);
}
