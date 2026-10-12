import {describe, expect, it} from "vitest";

import {
  createJudgeStore,
  judgeAnnouncement,
  judgeNotice,
  localJudge,
  parseJudgeResult,
  runJudge,
  taskTerms,
  type JudgeResult,
} from "../judge";

const page = {
  url: "https://example.com/",
  title: "",
  text: "",
};

const clefResult: JudgeResult = {
  verdict: "match",
  score: 1,
  confidence: 0.9,
  reasons: ["検索がお題の語を指しています"],
  source: "clef",
};

describe("taskTerms", () => {
  it("お題を語に分解する（記号と短すぎる語は落とす）", () => {
    expect(taskTerms("firefox-wasm")).toEqual(["firefox", "wasm"]);
    expect(taskTerms("MDN Web Docs")).toEqual(["MDN", "Web", "Docs"]);
    expect(taskTerms("three.js")).toEqual(["three"]);
  });

  it("同じ語は 1 つにまとめる（画面に出すので、最初の書き方を残す）", () => {
    expect(taskTerms("Vite vite VITE")).toEqual(["Vite"]);
  });
});

describe("localJudge", () => {
  it("URL・タイトルにお題の語があれば一致にする", () => {
    const result = localJudge({
      task: "WebAssembly",
      page: {
        url: "https://developer.mozilla.org/docs/WebAssembly",
        title: "WebAssembly - MDN",
        text: "",
      },
    });
    expect(result.verdict).toBe("match");
    expect(result.source).toBe("heuristic");
    expect(result.reasons[0]).toContain("WebAssembly");
  });

  it("本文にしか無ければ一部一致にする", () => {
    const result = localJudge({
      task: "WISP protocol",
      page: {...page, text: "the wisp relay"},
    });
    expect(result.verdict).toBe("partial");
  });

  it("まったく無ければ不一致にし、無い語を挙げる", () => {
    const result = localJudge({
      task: "Playwright",
      page: {...page, title: "料理のレシピ", text: "材料はこちら"},
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toContain("Playwright");
  });

  it("意味は分からないので、確からしさは主張しない", () => {
    expect(
      localJudge({task: "Vite", page: {...page, title: "Vite"}}).confidence,
    ).toBe(0.5);
  });
});

describe("runJudge", () => {
  it("Worker の答え（本物の Clef）をそのまま使う", async () => {
    const doFetch = async () =>
      new Response(JSON.stringify(clefResult), {status: 200});
    await expect(
      runJudge({task: "Vite", page}, doFetch as typeof fetch),
    ).resolves.toEqual(clefResult);
  });

  it("届かない・鍵が無い（503）・壊れた応答なら、簡易判定に落とす", async () => {
    const cases: Array<(url: string, init?: RequestInit) => Promise<Response>> =
      [
        async () => {
          throw new Error("offline");
        },
        async () => new Response("{}", {status: 503}),
        async () => new Response("not json", {status: 200}),
        async () =>
          new Response(JSON.stringify({verdict: "??"}), {status: 200}),
      ];
    for (const doFetch of cases) {
      const result = await runJudge(
        {task: "Vite", page: {...page, title: "Vite"}},
        doFetch as typeof fetch,
      );
      expect(result.source).toBe("heuristic");
      expect(result.verdict).toBe("match");
    }
  });
});

describe("parseJudgeResult", () => {
  it("正しい形だけを受ける", () => {
    expect(parseJudgeResult(clefResult)).toEqual(clefResult);
    expect(parseJudgeResult({...clefResult, verdict: "??"})).toBeNull();
    expect(parseJudgeResult({...clefResult, source: "??"})).toBeNull();
    expect(parseJudgeResult(null)).toBeNull();
  });

  it("範囲外の数は 0..1 に収める", () => {
    expect(
      parseJudgeResult({...clefResult, score: -3, confidence: 9})?.confidence,
    ).toBe(1);
  });
});

describe("createJudgeStore", () => {
  it("running を経て done になり、購読者へ知らせる", async () => {
    const store = createJudgeStore({judge: async () => clefResult});
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    await store.run({task: "Vite", page});
    expect(seen).toEqual(["running", "done"]);
    expect(store.getState()).toEqual({
      status: "done",
      task: "Vite",
      url: page.url,
      result: clefResult,
    });
  });

  it("判定が落ちたら error にして、画面に理由を出す", async () => {
    const store = createJudgeStore({
      judge: async () => {
        throw new Error("boom");
      },
    });
    await store.run({task: "Vite", page});
    expect(store.getState()).toEqual({
      status: "error",
      task: "Vite",
      url: page.url,
      message: "boom",
    });
  });

  it("新しい判定が始まったら、古い応答は捨てる", async () => {
    const resolvers: Array<(result: JudgeResult) => void> = [];
    const store = createJudgeStore({
      judge: () =>
        new Promise<JudgeResult>((resolve) => resolvers.push(resolve)),
    });
    const slow = store.run({task: "slow", page});
    const fast = store.run({task: "fast", page});
    resolvers[1]?.(clefResult);
    await fast;
    resolvers[0]?.({...clefResult, source: "heuristic"});
    await slow;
    expect(store.getState()).toEqual({
      status: "done",
      task: "fast",
      url: page.url,
      result: clefResult,
    });
  });

  it("reset で判定を畳む", async () => {
    const store = createJudgeStore({judge: async () => clefResult});
    await store.run({task: "Vite", page});
    store.reset();
    expect(store.getState()).toEqual({status: "idle"});
  });

  it("判定を始められないときは、その理由を画面に出す", () => {
    const store = createJudgeStore();
    store.fail("Vite", page.url, "今のページを読めません");
    expect(store.getState()).toEqual({
      status: "error",
      task: "Vite",
      url: page.url,
      message: "今のページを読めません",
    });
    expect(judgeNotice(store.getState())).toEqual([
      "判定できませんでした",
      "今のページを読めません",
    ]);
  });
});

describe("judgeNotice", () => {
  it("何も判定していなければ出さない", () => {
    expect(judgeNotice({status: "idle"})).toBeNull();
  });

  it("判定中はお題を出す", () => {
    expect(
      judgeNotice({status: "running", task: "Vite", url: page.url}),
    ).toEqual(["判定中… お題「Vite」"]);
  });

  it("結果は、一致度と判定した相手（Clef か簡易判定か）を出す", () => {
    const lines = judgeNotice({
      status: "done",
      task: "Vite",
      url: page.url,
      result: clefResult,
    });
    expect(lines?.[0]).toBe("判定: 一致 100% ・ Clef");
    expect(lines?.[1]).toBe("お題「Vite」");
    expect(lines).toHaveLength(3);
  });

  it("簡易判定に落ちたことは、画面にはっきり出す", () => {
    const lines = judgeNotice({
      status: "done",
      task: "Vite",
      url: page.url,
      result: {...clefResult, source: "heuristic"},
    });
    expect(lines?.[0]).toContain("簡易判定");
  });
});

describe("judgeAnnouncement", () => {
  it("黙って見ている間（idle・判定中）は、何も出さない", () => {
    expect(judgeAnnouncement({status: "idle"})).toBeNull();
    expect(
      judgeAnnouncement({status: "running", task: "Vite", url: page.url}),
    ).toBeNull();
  });

  it("合っていれば、一言だけを短く出す（画面は乱さない）", () => {
    expect(
      judgeAnnouncement({
        status: "done",
        task: "Vite",
        url: page.url,
        result: clefResult,
      }),
    ).toEqual({lines: ["お題に合っている"], tear: false, ms: 3000});
  });

  it("外れていれば、画面を乱して理由を出す（彼らの介入）", () => {
    const done = {
      status: "done" as const,
      task: "Vite",
      url: page.url,
      result: {
        ...clefResult,
        verdict: "mismatch" as const,
        score: 0,
      },
    };
    const announcement = judgeAnnouncement(done);
    expect(announcement?.tear).toBe(true);
    expect(announcement?.ms).toBeGreaterThan(5000);
    expect(announcement?.lines[0]).toContain("不一致");
  });

  it("判定できなかったときは、黙らずに出す", () => {
    const announcement = judgeAnnouncement({
      status: "error",
      task: "Vite",
      url: page.url,
      message: "今のページを読めません",
    });
    expect(announcement?.tear).toBe(false);
    expect(announcement?.lines[0]).toBe("判定できませんでした");
  });
});
