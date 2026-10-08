import {describe, expect, it} from "vitest";

import {engineManifestUrls, engineUrl} from "../engine";

describe("engineManifestUrls", () => {
  it("既定ではルートの manifest.json だけを見る", () => {
    expect(engineManifestUrls("")).toEqual(["/engine/manifest.json"]);
    expect(engineManifestUrls("?debug")).toEqual(["/engine/manifest.json"]);
  });

  it("?engine=<dir> があれば、そのバージョンを先に見る", () => {
    expect(engineManifestUrls("?engine=v0.0.9")).toEqual([
      "/engine/v0.0.9/manifest.json",
      "/engine/manifest.json",
    ]);
  });

  it("ディレクトリとして不正な値は無視する（パスの外へ出さない）", () => {
    expect(engineManifestUrls("?engine=../secret")).toEqual([
      "/engine/manifest.json",
    ]);
  });

  it("配信元（基点 URL）を付けた候補になる", () => {
    expect(
      engineManifestUrls("?engine=v0.0.9", "https://pub-x.r2.dev"),
    ).toEqual([
      "https://pub-x.r2.dev/engine/v0.0.9/manifest.json",
      "https://pub-x.r2.dev/engine/manifest.json",
    ]);
  });
});

describe("engineUrl", () => {
  it("マニフェストの相対パスには基点を付け、絶対 URL はそのまま使う", () => {
    expect(engineUrl("/engine/v0.0.9/gecko.js", "https://pub-x.r2.dev")).toBe(
      "https://pub-x.r2.dev/engine/v0.0.9/gecko.js",
    );
    expect(engineUrl("/engine/v0.0.9/gecko.js", "")).toBe(
      "/engine/v0.0.9/gecko.js",
    );
    expect(
      engineUrl("https://cdn.example.com/gecko.js", "https://pub-x.r2.dev"),
    ).toBe("https://cdn.example.com/gecko.js");
  });
});
