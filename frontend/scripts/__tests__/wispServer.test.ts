import {describe, expect, it} from "vitest";

import {isAllowedOrigin} from "../wispServer";

describe("isAllowedOrigin", () => {
  it("開発中のアプリ（localhost のオリジン）からの接続は通す", () => {
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://[::1]:5173",
    ]) {
      expect(isAllowedOrigin(origin)).toBe(true);
    }
  });

  it("ほかのサイトからの接続は拒む（開いているページから localhost を踏み台にさせない）", () => {
    for (const origin of [
      "https://evil.example",
      "http://localhost.evil.example",
      "null",
    ]) {
      expect(isAllowedOrigin(origin)).toBe(false);
    }
  });

  it("Origin の無い接続（ブラウザ以外）は通す", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
});
