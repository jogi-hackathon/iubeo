// WISP サーバー（Container の中で動く）。wisp-js をそのまま使い、トークンの検証は手前の Worker が行う。
// ローカル・私設の宛先への接続は wisp-js の既定で拒否される（オープンプロキシの踏み台にしない）。
import http from "node:http";
import {server as wisp} from "@mercuryworkshop/wisp-js/server";

const PORT = Number(process.env.PORT ?? 8080);

const server = http.createServer((_req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("wisp");
});
server.on("upgrade", (req, socket, head) => wisp.routeRequest(req, socket, head));
server.listen(PORT, "0.0.0.0", () => console.log(`[wisp] listening on ${PORT}`));
