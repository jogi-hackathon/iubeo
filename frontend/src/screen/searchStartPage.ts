/**
 * 電源を入れて最初に出るページ。検索語を入れて Google へ飛ぶ入口になる。HUD の住所欄の代わりに、
 * 画面の中のこの入力欄で検索する。
 *
 * ASCII だけで書くのは意図的。エンジンの最小 GRE には CJK フォントが無く、日本語は豆腐（□）になる。
 * お題は机のメモ（3D）に出している。
 */

/** エンジンへ渡せる URL の上限。data: URL のバイト数がこれを超えると静かに読み込めない */
export const MAX_URL_BYTES = 8192;

/**
 * WISP（実サイトへ出るプロキシ）の状態。none は設定が無い、unreachable は設定はあるが応答しない。
 */
export type WispState = "none" | "unreachable" | "ok";

const NETWORK_NOTE: Record<WispState, string> = {
  ok: '<p class="ok">Search results load through the WISP proxy.</p>',
  none: '<p class="warn">WISP proxy is not configured: results cannot load. Run <code>pnpm wisp</code> and open the app with <code>?wisp=ws://127.0.0.1:5001/</code>.</p>',
  unreachable:
    '<p class="warn">WISP proxy did not answer: results cannot load. Start <code>pnpm wisp</code>, then reload the app.</p>',
};

export const searchStartPage = (wisp: WispState): string => {
  const network = NETWORK_NOTE[wisp];

  return `<!doctype html><html><head><meta charset=utf-8><title>Search</title><style>
body{margin:0;padding:34px 40px;background:#fafaf7;color:#1d1d1f;font:16px/1.6 sans-serif}
h1{margin:0 0 14px;font-size:30px;font-weight:600}
form{display:flex;gap:8px;margin:0 0 18px}
input{flex:1;padding:10px 14px;font:inherit;border:1px solid #c9c9c4;border-radius:999px;outline:none}
input:focus{border-color:#4a7bd8}
button{padding:10px 20px;font:inherit;border:0;border-radius:999px;background:#1d1d1f;color:#fff;cursor:pointer}
.ok{color:#2a7a4b;margin:0 0 8px}.warn{color:#9a6200;margin:0 0 8px}
code{background:#eeeee9;padding:1px 6px;border-radius:4px;font-size:14px}
</style></head><body>
<h1>Search</h1>
<form action="https://www.google.com/search" method="get">
<input name="q" placeholder="Type a search and press Enter" autocomplete="off" autofocus>
<button type="submit">Search</button>
</form>
${network}
</body></html>`;
};

/** UTF-8 の HTML を data: URL にする。base64 なら 1 バイトあたりの膨らみが小さく、上限に余裕が残る */
export const pageToDataUrl = (html: string): string => {
  const bytes = new TextEncoder().encode(html);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:text/html;base64,${btoa(binary)}`;
};
