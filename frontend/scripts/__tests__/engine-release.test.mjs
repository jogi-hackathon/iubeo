import {describe, expect, it} from "vitest";

import {
  isEngineUpToDate,
  pickGeckoArchiveAsset,
  versionFromTag,
} from "../engine-release.mjs";

describe("pickGeckoArchiveAsset", () => {
  it("gecko.js の tar.gz だけを選ぶ", () => {
    const asset = pickGeckoArchiveAsset([
      {name: "chrome-demo-v0.0.9.tar.gz", browser_download_url: "https://x/a"},
      {name: "gecko.js-v0.0.8.tar.gz", browser_download_url: "https://x/b"},
      {name: "gecko.js-v0.0.9.tar.gz", browser_download_url: "https://x/c"},
    ]);
    expect(asset?.name).toBe("gecko.js-v0.0.9.tar.gz");
    expect(asset?.browser_download_url).toBe("https://x/c");
  });

  it("該当が無ければ null", () => {
    expect(
      pickGeckoArchiveAsset([
        {
          name: "chrome-demo-v0.0.9.tar.gz",
          browser_download_url: "https://x/a",
        },
      ]),
    ).toBeNull();
  });
});

describe("versionFromTag", () => {
  it("先頭の v を外す", () => {
    expect(versionFromTag("v0.0.9")).toBe("0.0.9");
    expect(versionFromTag("0.0.9")).toBe("0.0.9");
  });
});

describe("isEngineUpToDate", () => {
  it("manifest の version とタグが一致すれば true", () => {
    expect(isEngineUpToDate("0.0.9", "v0.0.9")).toBe(true);
    expect(isEngineUpToDate("0.0.8", "v0.0.9")).toBe(false);
    expect(isEngineUpToDate(null, "v0.0.9")).toBe(false);
  });
});
