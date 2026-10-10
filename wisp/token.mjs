
const encoder = new TextEncoder();

const decodeBase64Url = (text) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new Error("not base64url");
  }
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

/**
 * トークンを検証し、プレイヤー ID（sub）を返す。無効なら null。
 * @param {string} token
 * @param {string} key バックエンドと共有する鍵（IUBEO_WISP_KEY。32 バイト以上）
 * @param {number} nowSeconds 検証する時刻（Unix 秒）
 */
export const verifyWispToken = async (token, key, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const dot = token.indexOf(".");
  if (dot < 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let signatureBytes;
  let claimsText;
  try {
    signatureBytes = decodeBase64Url(signature);
    claimsText = new TextDecoder().decode(decodeBase64Url(payload));
  } catch {
    return null;
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    {name: "HMAC", hash: "SHA-256"},
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    signatureBytes,
    encoder.encode(payload),
  );
  if (!valid) {
    return null;
  }

  let claims;
  try {
    claims = JSON.parse(claimsText);
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) {
    return null;
  }
  const {sub, exp} = claims;
  if (typeof sub !== "string" || sub === "" || typeof exp !== "number") {
    return null;
  }
  if (nowSeconds >= exp) {
    return null;
  }
  return sub;
};

/**
 * リクエストの URL から token を取り出す。WISP のクライアントは接続先の URL が "/" で終わらないと "/" を足すので、
 * `?token=xxx` の後ろに "/" が付いて届く。base64url に "/" は無いので、末尾の "/" は落とす。無ければ空文字
 */
export const tokenFromUrl = (url) =>
  (new URL(url).searchParams.get("token") ?? "").replace(/\/+$/, "");
