// 2 枚のスクリーンショットをブラウザ内で比べる(ピクセルの最大差と、差のあるピクセル数)
// 使い方: node perf/lib/diff-shots.mjs <A.png> <B.png>
import {readFileSync} from "node:fs";
import {CHROME_PATH, importFromFrontend} from "./paths.mjs";

const [a, b] = process.argv.slice(2);
const {chromium} = await importFromFrontend("playwright-core");
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true});
const page = await browser.newPage();
await page.setContent("<p>diff</p>");
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const result = await page.evaluate(async ([da, db]) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(da), load(db)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return {sizeMismatch: [ia.width, ia.height, ib.width, ib.height]};
  const get = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
  const pa = get(ia), pb = get(ib);
  let max = 0, diffPx = 0, sum = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d > 0) diffPx++;
    if (d > max) max = d;
    sum += d;
  }
  return {maxChannelDelta: max, differingPixels: diffPx, totalPixels: pa.length / 4, meanDelta: sum / (pa.length / 4)};
}, [toDataUrl(a), toDataUrl(b)]);
console.log(JSON.stringify(result));
await browser.close();
