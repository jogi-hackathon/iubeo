// WISP サーバー（コンテナの中で動く）。wisp-js をそのまま使う。
// Cloudflare ではトークンの検証を手前の Worker が済ませてから流すので、ここでは何も検証しない。
// EC2 のように検証役が手前に居ない環境では IUBEO_WISP_REQUIRE_TOKEN=1 を付け、
// ?token= を IUBEO_WISP_KEY でここで検証する（オープンプロキシにしない）。
// 検証が要求されているのに鍵が無いときは、安全側に倒して全て拒否する。
// ローカル・私設の宛先への接続は wisp-js の既定で拒否される（オープンプロキシの踏み台にしない）。
import http from "node:http";
import {server as wisp} from "@mercuryworkshop/wisp-js/server";
import {tokenFromUrl, verifyWispToken} from "./token.mjs";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN_KEY = process.env.IUBEO_WISP_KEY ?? "";
const REQUIRE_TOKEN = process.env.IUBEO_WISP_REQUIRE_TOKEN === "1";

const reject = (socket, status) => {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
};

const server = http.createServer((_req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("wisp");
});
server.on("upgrade", (req, socket, head) => {
  if (!REQUIRE_TOKEN) {
    wisp.routeRequest(req, socket, head);
    return;
  }
  if (!TOKEN_KEY) {
    reject(socket, "503 Service Unavailable");
    return;
  }
  const token = tokenFromUrl(`http://wisp${req.url ?? "/"}`);
  verifyWispToken(token, TOKEN_KEY)
    .then((playerId) => {
      if (playerId === null) {
        reject(socket, "401 Unauthorized");
        return;
      }
      wisp.routeRequest(req, socket, head);
    })
    .catch(() => reject(socket, "401 Unauthorized"));
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[wisp] listening on ${PORT} requireToken=${REQUIRE_TOKEN}`);
});
