import {describe, expect, it} from "vitest";

import {tokenFromUrl, verifyWispToken} from "../wispToken";

// バックエンド(backend/internal/wisp/token_test.go)と同じ値。BACKEND_KEY で発行した固定のトークン（sub = p1）を、
// 同じ鍵で検証できることで、形式が揃っていることを確かめる。KEY は別の鍵（検証で拒否される側）
const KEY = "ffffffffffffffffffffffffffffffff";
const BACKEND_KEY = "0123456789abcdef0123456789abcdef";
const VECTOR_TOKEN =
  "eyJzdWIiOiJwMSIsImV4cCI6MTc5MTQ3NTUwMH0.gYfZ4NS194E_3ssWnAuuyahVxMxt9O6vjwG4W7oJHRM";
const VECTOR_NOW = 1791475200;

describe("verifyWispToken", () => {
  it("バックエンドが発行した固定のトークンを、同じ鍵で検証して sub を返す", async () => {
    expect(await verifyWispToken(VECTOR_TOKEN, BACKEND_KEY, VECTOR_NOW)).toBe(
      "p1",
    );
  });

  it("期限を過ぎたトークンは拒否する", async () => {
    expect(
      await verifyWispToken(VECTOR_TOKEN, BACKEND_KEY, VECTOR_NOW + 300),
    ).toBeNull();
  });

  it("鍵が違えば拒否する", async () => {
    expect(await verifyWispToken(VECTOR_TOKEN, KEY, VECTOR_NOW)).toBeNull();
  });

  it("中身を書き換えると拒否する（sub を変えても署名が合わない）", async () => {
    const [, sig] = VECTOR_TOKEN.split(".");
    // sub を p2 にした payload を、元の署名に付け替える
    const forgedPayload = btoa(
      JSON.stringify({sub: "p2", exp: VECTOR_NOW + 300}),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(
      await verifyWispToken(`${forgedPayload}.${sig}`, BACKEND_KEY, VECTOR_NOW),
    ).toBeNull();
  });

  it("形式が違うものは例外にせず拒否する", async () => {
    for (const bad of ["", "no-dot", "a.b.c", "!!.!!", "eyJ.@@"]) {
      expect(await verifyWispToken(bad, BACKEND_KEY, VECTOR_NOW)).toBeNull();
    }
  });
});

describe("tokenFromUrl", () => {
  it("token を取り出す。無ければ空文字", () => {
    expect(tokenFromUrl("https://x.test/wisp/?token=abc.def")).toBe("abc.def");
    expect(tokenFromUrl("https://x.test/wisp/")).toBe("");
  });

  it("WISP のクライアントが足した末尾の / は落とす", () => {
    expect(tokenFromUrl("https://x.test/wisp/?token=abc.def/")).toBe("abc.def");
  });
});
