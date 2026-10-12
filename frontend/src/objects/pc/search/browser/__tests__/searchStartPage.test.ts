import {describe, expect, it} from "vitest";

const isAscii = (text: string): boolean =>
  [...text].every((char) => char.charCodeAt(0) < 128);

import {
  MAX_URL_BYTES,
  pageToDataUrl,
  searchStartPage,
} from "../searchStartPage";

describe("searchStartPage", () => {
  it("検索語を入れて、自分の検索ページへ送る入力欄を持つ", () => {
    const html = searchStartPage(
      "ok",
      true,
      "https://iubeo.example/api/v1/search/page",
      "",
    );
    expect(html).toContain('action="https://iubeo.example/api/v1/search/page"');
    expect(html).toContain('name="q"');
    expect(html).not.toContain('name="t"');
  });

  it("トークンがあれば、隠し欄で検索ページへ渡す（属性は escape する）", () => {
    const html = searchStartPage(
      "ok",
      true,
      "https://iubeo.example/api/v1/search/page",
      'a"b',
    );
    expect(html).toContain('<input type="hidden" name="t" value="a&#34;b">');
  });

  it("既定の検索先は、現在のオリジンの検索ページ（ブラウザ外では相対）", () => {
    expect(searchStartPage("ok")).toContain('action="/api/v1/search/page"');
  });

  it("エンジンの最小 GRE は CJK フォントを持たないので、ASCII だけで書く", () => {
    expect(isAscii(searchStartPage("ok"))).toBe(true);
    expect(isAscii(searchStartPage("none"))).toBe(true);
  });

  it("WISP の状態に応じて、検索結果が出るか・どう直すかを書く", () => {
    expect(searchStartPage("none")).toContain("WISP proxy is not configured");
    expect(searchStartPage("unreachable")).toContain(
      "WISP proxy did not answer",
    );
    expect(searchStartPage("ok")).toContain("load through the WISP proxy");
    expect(searchStartPage("ok")).not.toContain("not configured");
  });

  it("本番では、開発の手順（pnpm wisp）を出さない", () => {
    for (const state of ["none", "unreachable", "ok"] as const) {
      const html = searchStartPage(state, false);
      expect(html).not.toContain("pnpm wisp");
      expect(isAscii(html)).toBe(true);
    }
    expect(searchStartPage("unreachable", false)).toContain(
      "search proxy did not answer",
    );
  });

  it("data: URL にしたとき、エンジンが読める上限(8192 バイト)に収まる", () => {
    expect(pageToDataUrl(searchStartPage("none")).length).toBeLessThan(
      MAX_URL_BYTES,
    );
  });
});

describe("pageToDataUrl", () => {
  it("data:text/html の base64 の URL にする", () => {
    expect(pageToDataUrl("<p>hi</p>")).toBe(
      `data:text/html;base64,${btoa("<p>hi</p>")}`,
    );
  });
});
