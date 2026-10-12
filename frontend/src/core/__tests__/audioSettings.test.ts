import {describe, expect, it} from "vitest";

import {DEFAULT_AUDIO_SETTINGS, parseAudioSettings} from "../audioSettings";

describe("parseAudioSettings", () => {
  it("オブジェクトでなければ既定値", () => {
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings("x")).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("音量は 0〜上限に丸め、不正な値は既定値", () => {
    const s = parseAudioSettings({
      gameVolume: 5,
      voiceVolume: -1,
      micVolume: "2",
    });
    expect(s.gameVolume).toBe(1);
    expect(s.voiceVolume).toBe(0);
    expect(s.micVolume).toBe(DEFAULT_AUDIO_SETTINGS.micVolume);
    expect(parseAudioSettings({voiceVolume: 9}).voiceVolume).toBe(2);
  });

  it("デバイスは空でない文字列だけ残し、それ以外は既定(null)", () => {
    const s = parseAudioSettings({outputDeviceId: "abc", inputDeviceId: ""});
    expect(s.outputDeviceId).toBe("abc");
    expect(s.inputDeviceId).toBeNull();
    expect(parseAudioSettings({inputDeviceId: 3}).inputDeviceId).toBeNull();
  });
});
