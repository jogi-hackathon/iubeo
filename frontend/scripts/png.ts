// 最小の PNG エンコーダ(8bit グレースケール・フィルタなし)。Node 専用
import {deflateSync} from "node:zlib";

let crcTable: Uint32Array | null = null;

const crc32 = (buf: Uint8Array): number => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

/** PNG のフィルタの予測値。a = 左、b = 上、c = 左上(1 画素 1 バイト) */
const predict = (filter: number, a: number, b: number, c: number): number => {
  switch (filter) {
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    default:
      return 0;
  }
};

export const encodePNGGray8 = (
  width: number,
  height: number,
  data: Uint8Array,
): Buffer => {
  if (data.length !== width * height) {
    throw new Error(
      `[png] サイズが一致しません(${data.length} != ${width}x${height})`,
    );
  }
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  // 10〜12: 圧縮・フィルタ・インターレースはすべて 0(既定)
  const raw = Buffer.alloc((width + 1) * height);
  // 行ごとに、差分の絶対値の和が最小になるフィルタ(なし・Sub・Up・Average・Paeth)を選ぶ(PNG 仕様の推奨の方法)。
  // 可逆なので画素は変わらない。AO は滑らかなので、フィルタなしより 2〜3 割小さくなる(配信とウォームアップの待ちが減る)
  const candidates = Array.from({length: 5}, () => new Uint8Array(width));
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * width, (y + 1) * width);
    const up = y > 0 ? data.subarray((y - 1) * width, y * width) : null;
    let best = 0;
    let bestSum = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      const out = candidates[filter] as Uint8Array;
      let sum = 0;
      for (let x = 0; x < width; x++) {
        const a = x > 0 ? (row[x - 1] as number) : 0;
        const b = up ? (up[x] as number) : 0;
        const c = x > 0 && up ? (up[x - 1] as number) : 0;
        const v = ((row[x] as number) - predict(filter, a, b, c)) & 0xff;
        out[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = filter;
      }
    }
    raw[y * (width + 1)] = best; // 行ごとのフィルタ種別
    raw.set(candidates[best] as Uint8Array, y * (width + 1) + 1);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, {level: 9})),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
