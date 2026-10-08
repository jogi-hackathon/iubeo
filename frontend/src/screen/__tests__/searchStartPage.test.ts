import {describe, expect, it} from "vitest";

const isAscii = (text: string): boolean =>
  [...text].every((char) => char.charCodeAt(0) < 128);

import {
  MAX_URL_BYTES,
  pageToDataUrl,
  searchStartPage,
} from "../searchStartPage";

describe("searchStartPage", () => {
  it("検索語を入れて Google の検索へ送る入力欄を持つ", () => {
    const html = searchStartPage("ok");
    expect(html).toContain('action="https://www.google.com/search"');
    expect(html).toContain('name="q"');
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
