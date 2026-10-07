import {describe, expect, it, vi} from "vitest";

import {ApiError, createApiClient} from "../http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });

describe("createApiClient", () => {
  it("同じオリジンの Cookie を付けて送り、本文を返す", async () => {
    const fetch = vi.fn(async () =>
      json(201, {playerId: "p1", sessionId: null}),
    );
    const api = createApiClient({fetch});

    await expect(api.createPlayer()).resolves.toEqual({
      playerId: "p1",
      sessionId: null,
    });
    expect(fetch).toHaveBeenCalledWith("/api/v1/players", {
      method: "POST",
      credentials: "same-origin",
      headers: {},
      body: undefined,
    });
  });

  it("本文を JSON で送る", async () => {
    const fetch = vi.fn(async () => json(201, {}));
    const api = createApiClient({fetch, baseUrl: "http://x"});
    await api.createSession({mode: "single"});
    expect(fetch).toHaveBeenCalledWith("http://x/api/v1/sessions", {
      method: "POST",
      credentials: "same-origin",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({mode: "single"}),
    });
  });

  it("204 は undefined を返す", async () => {
    const api = createApiClient({
      fetch: async () => new Response(null, {status: 204}),
    });
    await expect(api.leaveMatchmaking()).resolves.toBeUndefined();
  });

  it("sessionId はパスに埋めるときにエスケープする", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, {}));
    await createApiClient({fetch: fetchMock}).getSession("a/b");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/sessions/a%2Fb");
  });

  it("2xx 以外は、サーバーの Error を持つ ApiError を投げる", async () => {
    const api = createApiClient({
      fetch: async () => json(404, {code: "not_found", message: "not queued"}),
    });
    const error = await api.getMatchmaking().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "not_found",
      message: "not queued",
    });
  });

  it("本文が Error の形でなければ code は unknown", async () => {
    const api = createApiClient({
      fetch: async () => new Response("bad gateway", {status: 502}),
    });
    await expect(api.getMe()).rejects.toMatchObject({
      status: 502,
      code: "unknown",
    });
  });
});
