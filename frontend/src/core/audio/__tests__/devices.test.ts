import {describe, expect, it} from "vitest";

import {toAudioDeviceList} from "../devices";

const info = (
  kind: MediaDeviceKind,
  deviceId: string,
  label = "",
): MediaDeviceInfo =>
  ({kind, deviceId, label, groupId: "", toJSON: () => ({})}) as MediaDeviceInfo;

describe("toAudioDeviceList", () => {
  it("Chrome の default・communications を除き、入力と出力に分ける", () => {
    const list = toAudioDeviceList(
      [
        info("audioinput", "default", "既定 - USB"),
        info("audioinput", "communications", "通信"),
        info("audioinput", "m1", "USB マイク"),
        info("audiooutput", "s1", "ヘッドホン"),
        info("videoinput", "v1", "カメラ"),
      ],
      true,
    );
    expect(list).toEqual({
      inputs: [{id: "m1", label: "USB マイク"}],
      outputs: [{id: "s1", label: "ヘッドホン"}],
      canSelectOutput: true,
      needsPermission: false,
    });
  });

  it("許可前で名前が無いときは番号で呼ぶ", () => {
    const list = toAudioDeviceList(
      [info("audioinput", "m1"), info("audioinput", "m2")],
      false,
    );
    expect(list.inputs.map((d) => d.label)).toEqual(["マイク 1", "マイク 2"]);
  });

  it("許可前で deviceId が空のものは選べないので除き、許可が要ると知らせる", () => {
    const list = toAudioDeviceList([info("audioinput", "")], false);
    expect(list.inputs).toEqual([]);
    expect(list.needsPermission).toBe(true);
  });
});
