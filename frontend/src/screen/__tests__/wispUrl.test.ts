import {describe, expect, it, vi} from "vitest";

import {
  describeWispHost,
  resolveWispUrl,
  WISP_TOKEN_PATH,
  wispOverrideFrom,
} from "../wispUrl";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });

describe("wispOverrideFrom", () => {
  it("?wisp= があれば、それを優先する", () => {
    expect(wispOverrideFrom("?wisp=ws://127.0.0.1:5001/", "ws://other/")).toBe(
      "ws://127.0.0.1:5001/",
    );
  });

  it("?wisp= が空なら、無効の印（空文字）になる", () => {
    expect(wispOverrideFrom("?wisp=", "ws://other/")).toBe("");
  });

  it("URL に無ければ VITE_WISP_URL。空や未設定は、指定なし（undefined）", () => {
    expect(wispOverrideFrom("?debug", "ws://127.0.0.1:5001/")).toBe(
      "ws://127.0.0.1:5001/",
    );
    expect(wispOverrideFrom("", "")).toBeUndefined();
    expect(wispOverrideFrom("", undefined)).toBeUndefined();
  });
});

describe("resolveWispUrl", () => {
  it("直結の指定があれば、トークンの API は呼ばない", async () => {
    const fetchFn = vi.fn();
    expect(await resolveWispUrl("ws://127.0.0.1:5001/", fetchFn)).toBe(
      "ws://127.0.0.1:5001/",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("直結の指定が空なら、無効（undefined）で API も呼ばない", async () => {
    const fetchFn = vi.fn();
    expect(await resolveWispUrl("", fetchFn)).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("指定が無ければ、トークン付きの URL を発行してもらう（同じオリジンの Cookie 付き）", async () => {
    const url = "wss://example.test/wisp/?token=abc.def";
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {url, expiresAt: "2026-10-09T00:00:00Z"}),
    );
    expect(await resolveWispUrl(undefined, fetchFn)).toBe(url);
    expect(fetchFn).toHaveBeenCalledWith(WISP_TOKEN_PATH, {
      credentials: "same-origin",
    });
  });

  it("未ログイン(401)や未設定(503)、通信の失敗は、WISP 無し（undefined）として扱い、例外は投げない", async () => {
    expect(
      await resolveWispUrl(undefined, async () =>
        jsonResponse(401, {code: "unauthorized"}),
      ),
    ).toBeUndefined();
    expect(
      await resolveWispUrl(undefined, async () =>
        jsonResponse(503, {code: "wisp_unavailable"}),
      ),
    ).toBeUndefined();
    expect(
      await resolveWispUrl(undefined, async () => {
        throw new TypeError("network down");
      }),
    ).toBeUndefined();
  });
});

describe("describeWispHost", () => {
  it("トークンを含む URL でも、表示はホスト名だけ", () => {
    expect(describeWispHost("wss://example.test/wisp/?token=secret")).toBe(
      "example.test",
    );
    expect(describeWispHost("not a url")).toBe("");
  });
});
