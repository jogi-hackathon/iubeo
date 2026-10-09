import {describe, expect, it} from "vitest";

import {type LayoutItem} from "../../../objects/layout";
import {ROOM_INITIAL} from "../../../scenes/RoomScene/initial";
import {ROOM_LAYOUT} from "../../../scenes/RoomScene/layout";
import {TEST_INITIAL} from "../../../scenes/TestScene/initial";
import {TEST_LAYOUT} from "../../../scenes/TestScene/layout";
import {LOCAL_AUTHORITY_PLAYER_ID, planLocalObjects} from "../plan";

const PLAYER = LOCAL_AUTHORITY_PLAYER_ID;

describe("planLocalObjects", () => {
  it("room は 4 つ(ディレクトリ・ワークスペース・キャンバス・PC)。個人の物の owner は自分、id はレイアウトの id", () => {
    const planned = planLocalObjects({
      layout: ROOM_LAYOUT,
      initial: ROOM_INITIAL,
      playerId: PLAYER,
    });

    expect(planned.map((o) => o.id)).toEqual([
      "directory-1",
      "workspace-1",
      "canvas-1",
      "pc-1",
    ]);
    expect(PLAYER).toBe("local-player");
    for (const o of planned.slice(1)) {
      expect(o.scope).toBe("personal");
      expect(o.owner).toBe("local-player");
    }
  });

  it("ディレクトリは共有で、在庫は初期設定の stock。在庫はコピーされる(レイアウトや初期設定を汚さない)", () => {
    const planned = planLocalObjects({
      layout: ROOM_LAYOUT,
      initial: ROOM_INITIAL,
      playerId: PLAYER,
    });
    const directory = planned[0];

    expect(directory?.kind).toBe("directory");
    expect(directory?.scope).toBe("shared");
    expect(directory?.owner).toBeUndefined();
    expect(directory?.data).toEqual({
      stock: ROOM_INITIAL.directory?.stock,
      outputs: 0,
    });
    const stock = (directory?.data as {stock: unknown[]} | undefined)?.stock;
    expect(stock).not.toBe(ROOM_INITIAL.directory?.stock);
  });

  it("test は初期設定に書いた dummy-1〜3 だけ置く。予備の dummy-4〜8 は置かない", () => {
    const planned = planLocalObjects({
      layout: TEST_LAYOUT,
      initial: TEST_INITIAL,
      playerId: PLAYER,
    });
    const ids = planned.map((o) => o.id);

    expect(ids).toEqual([
      "dummy-1",
      "dummy-2",
      "dummy-3",
      "directory-1",
      "workspace-1",
      "canvas-1",
      "pc-1",
    ]);
  });

  it("ダミーの箱の scope と使えるかは初期設定どおり(personal は owner が自分、shared は owner なし)", () => {
    const planned = planLocalObjects({
      layout: TEST_LAYOUT,
      initial: TEST_INITIAL,
      playerId: PLAYER,
    });
    const byId = Object.fromEntries(planned.map((o) => [o.id, o]));

    expect(byId["dummy-1"]).toMatchObject({
      scope: "personal",
      owner: "local-player",
      availability: "available",
    });
    expect(byId["dummy-2"]?.scope).toBe("shared");
    expect(byId["dummy-2"]?.owner).toBeUndefined();
    expect(byId["dummy-3"]).toMatchObject({
      scope: "personal",
      availability: "unavailable",
    });
  });

  it("まだ持たない種類(レイアウトにあっても)は置かない", () => {
    const layout = {
      chair: {id: "chair-1", position: [0, 0, 0]} satisfies LayoutItem,
      workspace: {id: "workspace-1", position: [0, 0, 0]} satisfies LayoutItem,
    };

    const planned = planLocalObjects({
      layout,
      initial: {},
      playerId: PLAYER,
    });

    expect(planned.map((o) => o.id)).toEqual(["workspace-1"]);
  });
});
