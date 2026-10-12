/** @typedef {{ name: string; browser_download_url: string }} ReleaseAsset */
/** @typedef {{ tag_name: string; assets: ReleaseAsset[] }} Release */

export const REPO = "thirdlf03/firefox-wasm";
export const RELEASES_LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const releaseByTagUrl = (tag) =>
  `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`;

const GECKO_ASSET_PATTERN = /^gecko\.js-v.+\.tar\.gz$/i;

/**
 * @param {ReleaseAsset[]} assets
 * @returns {ReleaseAsset | null}
 */
export const pickGeckoArchiveAsset = (assets) => {
  if (!Array.isArray(assets)) {
    return null;
  }
  const matches = assets.filter((asset) =>
    GECKO_ASSET_PATTERN.test(asset.name ?? ""),
  );
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches[matches.length - 1];
};

/**
 * @param {string} tagName e.g. "v0.0.9"
 * @returns {string} semver without leading v, e.g. "0.0.9"
 */
export const versionFromTag = (tagName) => {
  const trimmed = (tagName ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
};

/**
 * @param {string | undefined} installedVersion from manifest.json
 * @param {string} tagName target release tag
 * @returns {boolean}
 */
export const isEngineUpToDate = (installedVersion, tagName) => {
  const target = versionFromTag(tagName);
  if (!installedVersion || !target) {
    return false;
  }
  return installedVersion === target;
};
