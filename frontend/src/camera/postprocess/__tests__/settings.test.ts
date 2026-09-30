import {afterEach, describe, expect, it, vi} from "vitest";

import {
  DEFAULT_POSTPROCESS_SETTINGS,
  getPostProcessSettings,
  resetPostProcessSettings,
  subscribePostProcessSettings,
  updatePostProcessSettings,
} from "../settings";

afterEach(resetPostProcessSettings);

describe("postprocess settings", () => {
  it("既定値: 全体 on・AO on・bloom on(threshold 1.0)・pixelate off・Neutral・exposure 1.2", () => {
    const s = getPostProcessSettings();
    expect(s.enabled).toBe(true);
    expect(s.ao.enabled).toBe(true);
    expect(s.ao.showOnly).toBe(false);
    expect(s.ao.denoise).toBe(true);
    expect(s.bakedAO).toEqual({enabled: true, intensity: 1});
    expect(s.bloom.enabled).toBe(true);
    expect(s.bloom.threshold).toBe(1);
    expect(s.pixelate.enabled).toBe(false);
    expect(s.vignette.enabled).toBe(true);
    expect(s.toneMapping).toBe("neutral");
    expect(s.exposure).toBe(1.2);
  });

  it("トップレベルの項目を更新し、購読者へ通知する", () => {
    const listener = vi.fn();
    const off = subscribePostProcessSettings(listener);
    updatePostProcessSettings({exposure: 2, toneMapping: "agx"});
    expect(getPostProcessSettings()).toMatchObject({
      exposure: 2,
      toneMapping: "agx",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    updatePostProcessSettings({exposure: 3});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("グループは指定した項目だけを更新し、他の項目は保つ", () => {
    updatePostProcessSettings({bloom: {strength: 1.5}});
    expect(getPostProcessSettings().bloom).toEqual({
      ...DEFAULT_POSTPROCESS_SETTINGS.bloom,
      strength: 1.5,
    });
  });

  it("変更が無ければ参照も通知も変えない(useSyncExternalStore 向け)", () => {
    const before = getPostProcessSettings();
    const listener = vi.fn();
    subscribePostProcessSettings(listener);
    updatePostProcessSettings({
      exposure: before.exposure,
      bloom: {strength: before.bloom.strength},
    });
    updatePostProcessSettings({});
    expect(getPostProcessSettings()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("更新は新しいオブジェクトを作り、既定値を書き換えない", () => {
    updatePostProcessSettings({pixelate: {enabled: true}});
    expect(DEFAULT_POSTPROCESS_SETTINGS.pixelate.enabled).toBe(false);
    expect(getPostProcessSettings().pixelate.enabled).toBe(true);
  });

  it("reset で既定値に戻る", () => {
    updatePostProcessSettings({enabled: false, bloom: {strength: 2}});
    resetPostProcessSettings();
    expect(getPostProcessSettings()).toBe(DEFAULT_POSTPROCESS_SETTINGS);
  });
});
