import {describe, expect, it, vi} from "vitest";

import {touchTutorialPresence} from "../tutorialPresence";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"},
  });

describe("touchTutorialPresence", () => {
  // アプリを開いた直後は Cookie がまだ無い。ここで 401 を捨てると、WISP の対象にならないまま
  it("Cookie が無ければ、プレイヤーを作ってから送り直す", async () => {
    let issued = false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/players") {
        issued = true;
        return json(200, {id: "p1"});
      }
      return issued
        ? new Response(null, {status: 204})
        : json(401, {code: "unauthorized"});
    });

    await touchTutorialPresence(fetchFn);

    expect(fetchFn.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/v1/tutorial/presence",
      "/api/v1/players",
      "/api/v1/tutorial/presence",
    ]);
  });

  it("Cookie があれば、余計にプレイヤーを作らない", async () => {
    const fetchFn = vi.fn(async () => new Response(null, {status: 204}));
    await touchTutorialPresence(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("通信が失敗しても例外にしない", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await expect(touchTutorialPresence(fetchFn)).resolves.toBeUndefined();
  });
});
