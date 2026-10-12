import {describe, expect, it, vi} from "vitest";

import type {AppPointerEvent, AppView, DesktopApp} from "../app";
import {
  clientRect,
  closeButtonRect,
  iconCellRect,
  minimizeButtonRect,
  START_BUTTON,
  startEntryRects,
  taskButtonRects,
  titleBarRect,
  WORK_AREA,
} from "../layout";
import {createShell} from "../shell";

const center = (r: {x: number; y: number; width: number; height: number}) => ({
  x: r.x + Math.floor(r.width / 2),
  y: r.y + Math.floor(r.height / 2),
});

const fakeApp = (id: string) => {
  const events: AppPointerEvent[] = [];
  const dispose = vi.fn();
  let notify: (() => void) | null = null;
  const app: DesktopApp = {
    id,
    title: id,
    icon: "settings",
    size: {width: 200, height: 120},
    open: (): AppView => ({
      paint: () => {},
      pointer: (e) => events.push(e),
      subscribe: (l) => {
        notify = l;
        return () => {
          notify = null;
        };
      },
      dispose,
    }),
  };
  return {app, events, dispose, change: () => notify?.()};
};

const make = () => {
  let t = 0;
  const a = fakeApp("a");
  const b = fakeApp("b");
  const shell = createShell({apps: [a.app, b.app], now: () => t});
  const click = (p: {x: number; y: number}) => {
    shell.pointer({type: "down", ...p, button: 0});
    shell.pointer({type: "up", ...p, button: 0});
  };
  const advance = (ms: number) => {
    t += ms;
  };
  return {shell, a, b, click, advance};
};

describe("アイコン", () => {
  it("クリックで選び、何もない所のクリックで選びを外す", () => {
    const {shell, click} = make();
    click(center(iconCellRect(0)));
    expect(shell.getState().selectedIcon).toBe("a");
    click({x: 400, y: 200});
    expect(shell.getState().selectedIcon).toBeNull();
  });

  it("同じアイコンを素早く 2 回押すと開く。間が空いたり別のアイコンなら開かない", () => {
    const {shell, click, advance} = make();
    const p = center(iconCellRect(0));
    click(p);
    advance(600);
    click(p);
    expect(shell.getState().windows).toHaveLength(0);
    advance(100);
    click(p);
    expect(shell.getState().windows.map((w) => w.app.id)).toEqual(["a"]);

    advance(1000);
    click(center(iconCellRect(1)));
    advance(100);
    click(p);
    expect(shell.getState().windows).toHaveLength(1);
  });

  it("3 回目の押しは、新しいダブルクリックの 1 回目として数える", () => {
    const {shell, click, advance} = make();
    const p = center(iconCellRect(0));
    click(p);
    advance(100);
    click(p);
    shell.close(shell.getState().windows[0]!.id);
    advance(100);
    click(p);
    expect(shell.getState().windows).toHaveLength(0);
  });
});

describe("窓", () => {
  it("同じアプリは 1 つだけ開き、開き直すと手前に出す", () => {
    const {shell} = make();
    shell.launch("a");
    shell.launch("b");
    shell.launch("a");
    const {windows, focused} = shell.getState();
    expect(windows.map((w) => w.app.id)).toEqual(["b", "a"]);
    expect(focused).toBe(windows[1]!.id);
  });

  it("開いた窓は作業領域の中に収まる", () => {
    const {shell} = make();
    shell.launch("a");
    const {rect} = shell.getState().windows[0]!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(WORK_AREA.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(WORK_AREA.height);
  });

  it("後ろの窓を押すと手前に出る", () => {
    const {shell, click} = make();
    shell.launch("a");
    shell.launch("b");
    const back = shell.getState().windows[0]!;
    const front = shell.getState().windows[1]!;
    // 後ろの窓だけにかかる所(左上の枠の内側)
    const p = {x: Math.min(back.rect.x, front.rect.x) + 6, y: back.rect.y + 30};
    expect(p.x).toBeLessThan(front.rect.x);
    click(p);
    expect(shell.getState().windows.at(-1)!.id).toBe(back.id);
    expect(shell.getState().focused).toBe(back.id);
  });

  it("タイトルバーをつかんで動かす。タイトルバーは作業領域の外へ出しきらない", () => {
    const {shell} = make();
    shell.launch("a");
    const win = shell.getState().windows[0]!;
    const title = titleBarRect(win.rect);
    const grab = {x: title.x + 20, y: title.y + 5};
    shell.pointer({type: "down", ...grab, button: 0});
    shell.pointer({type: "move", x: grab.x + 30, y: grab.y + 10, button: -1});
    expect(shell.getState().windows[0]!.rect).toMatchObject({
      x: win.rect.x + 30,
      y: win.rect.y + 10,
    });
    shell.pointer({type: "move", x: grab.x, y: 2000, button: -1});
    const moved = shell.getState().windows[0]!.rect;
    expect(moved.y).toBeLessThan(WORK_AREA.height);
    shell.pointer({type: "up", x: grab.x, y: 2000, button: 0});
    shell.pointer({type: "move", x: 0, y: 0, button: -1});
    expect(shell.getState().windows[0]!.rect).toEqual(moved);
  });

  it("× で閉じ、中身を片付ける。押したまま外へずらして離すと閉じない", () => {
    const {shell, a, click} = make();
    shell.launch("a");
    const win = shell.getState().windows[0]!;
    const close = center(closeButtonRect(win.rect));
    shell.pointer({type: "down", ...close, button: 0});
    expect(shell.getState().pressed).toEqual({kind: "close", windowId: win.id});
    shell.pointer({type: "up", x: close.x - 40, y: close.y, button: 0});
    expect(shell.getState().windows).toHaveLength(1);

    click(close);
    expect(shell.getState().windows).toHaveLength(0);
    expect(shell.getState().taskOrder).toEqual([]);
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it("_ で最小化すると、次に手前の窓へフォーカスが移る", () => {
    const {shell, click} = make();
    shell.launch("a");
    shell.launch("b");
    const [first, second] = shell.getState().windows;
    click(center(minimizeButtonRect(second!.rect)));
    expect(
      shell.getState().windows.find((w) => w.id === second!.id)!.minimized,
    ).toBe(true);
    expect(shell.getState().focused).toBe(first!.id);
  });

  it("中身への入力は、窓の中身の左上からの座標で渡し、押した窓へ離すまで送る", () => {
    const {shell, a} = make();
    shell.launch("a");
    const client = clientRect(shell.getState().windows[0]!.rect);
    shell.pointer({type: "down", x: client.x + 10, y: client.y + 5, button: 0});
    shell.pointer({
      type: "move",
      x: client.x - 50,
      y: client.y + 5,
      button: -1,
    });
    shell.pointer({type: "up", x: client.x - 50, y: client.y + 5, button: 0});
    expect(a.events).toEqual([
      {type: "down", x: 10, y: 5, button: 0},
      {type: "move", x: -50, y: 5, button: -1},
      {type: "up", x: -50, y: 5, button: 0},
    ]);
  });

  it("中身が変わったと知らせてきたら、描き直しの目安を進める", () => {
    const {shell, a} = make();
    shell.launch("a");
    const before = shell.getVersion();
    a.change();
    expect(shell.getVersion()).toBeGreaterThan(before);
  });
});

describe("タスクバー", () => {
  it("窓のボタンは、手前なら最小化、最小化なら戻す、それ以外は手前に出す", () => {
    const {shell, click} = make();
    shell.launch("a");
    shell.launch("b");
    const [aId, bId] = shell.getState().taskOrder;
    const buttons = taskButtonRects(2);

    click(center(buttons[1]!));
    expect(shell.getState().windows.find((w) => w.id === bId)!.minimized).toBe(
      true,
    );
    click(center(buttons[1]!));
    expect(shell.getState().windows.find((w) => w.id === bId)!.minimized).toBe(
      false,
    );
    expect(shell.getState().focused).toBe(bId);

    click(center(buttons[0]!));
    expect(shell.getState().focused).toBe(aId);
    expect(shell.getState().windows.at(-1)!.id).toBe(aId);
  });

  it("ボタンの並びは開いた順のまま(手前に出しても入れ替わらない)", () => {
    const {shell, click} = make();
    shell.launch("a");
    shell.launch("b");
    const order = shell.getState().taskOrder;
    click(center(taskButtonRects(2)[0]!));
    expect(shell.getState().taskOrder).toEqual(order);
  });
});

describe("スタートメニュー", () => {
  it("スタートで開き、項目でアプリを開いて閉じる", () => {
    const {shell, click} = make();
    click(center(START_BUTTON));
    expect(shell.getState().startOpen).toBe(true);
    click(center(startEntryRects(shell.entries)[1]!));
    expect(shell.getState().startOpen).toBe(false);
    expect(shell.getState().windows.map((w) => w.app.id)).toEqual(["b"]);
  });

  it("メニューの外を押すと閉じるだけで、押した先には届かない", () => {
    const {shell, click} = make();
    click(center(START_BUTTON));
    click(center(iconCellRect(0)));
    expect(shell.getState().startOpen).toBe(false);
    expect(shell.getState().selectedIcon).toBeNull();
  });

  it("スタートをもう一度押すと閉じる", () => {
    const {shell, click} = make();
    click(center(START_BUTTON));
    click(center(START_BUTTON));
    expect(shell.getState().startOpen).toBe(false);
  });

  it("上に乗った項目を覚え、外れたら忘れる", () => {
    const {shell, click} = make();
    click(center(START_BUTTON));
    const rects = startEntryRects(shell.entries);
    shell.pointer({type: "move", ...center(rects[0]!), button: -1});
    expect(shell.getState().hoveredEntry).toBe(0);
    shell.pointer({type: "move", x: 600, y: 100, button: -1});
    expect(shell.getState().hoveredEntry).toBeNull();
  });
});

describe("settle", () => {
  it("押しかけだけ片付け、窓や開いたメニューは残す", () => {
    const {shell} = make();
    shell.launch("a");
    shell.pointer({type: "down", ...center(START_BUTTON), button: 0});
    shell.settle();
    expect(shell.getState()).toMatchObject({startOpen: true, pressed: null});
    expect(shell.getState().windows).toHaveLength(1);
  });

  it("つかんでいた窓は、離れたあとに動かない", () => {
    const {shell} = make();
    shell.launch("a");
    const win = shell.getState().windows[0]!;
    const title = titleBarRect(win.rect);
    shell.pointer({type: "down", x: title.x + 20, y: title.y + 5, button: 0});
    shell.settle();
    shell.pointer({type: "move", x: title.x + 80, y: title.y + 50, button: -1});
    expect(shell.getState().windows[0]!.rect).toEqual(win.rect);
  });
});

it("左ボタン以外の押し離しは無視する", () => {
  const {shell} = make();
  shell.pointer({type: "down", ...center(START_BUTTON), button: 1});
  expect(shell.getState().startOpen).toBe(false);
});
