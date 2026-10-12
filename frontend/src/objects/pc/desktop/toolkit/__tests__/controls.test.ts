import {describe, expect, it, vi} from "vitest";

import {
  createButton,
  createControlSet,
  createDropdown,
  createSlider,
  createTabs,
  DROPDOWN_ITEM_HEIGHT,
} from "../controls";

const RECT = {x: 10, y: 10, width: 80, height: 20};

const press = (
  set: ReturnType<typeof createControlSet>,
  type: "down" | "move" | "up",
  x: number,
  y: number,
) => set.pointer({type, x, y, button: type === "move" ? -1 : 0});

describe("createButton", () => {
  it("上で押して上で離すと押したことになる。押している間はへこむ", () => {
    const onClick = vi.fn();
    const button = createButton({rect: RECT, onClick});
    const set = createControlSet([button]);
    press(set, "down", 20, 15);
    expect(button.pressed()).toBe(true);
    press(set, "up", 20, 15);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.pressed()).toBe(false);
  });

  it("外へずらすとへこみが戻り、外で離すと押したことにならない。戻せば押せる", () => {
    const onClick = vi.fn();
    const button = createButton({rect: RECT, onClick});
    const set = createControlSet([button]);
    press(set, "down", 20, 15);
    press(set, "move", 200, 15);
    expect(button.pressed()).toBe(false);
    press(set, "up", 200, 15);
    expect(onClick).not.toHaveBeenCalled();

    press(set, "down", 20, 15);
    press(set, "move", 200, 15);
    press(set, "move", 30, 15);
    press(set, "up", 30, 15);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("使えないボタンは押せない", () => {
    const onClick = vi.fn();
    const set = createControlSet([
      createButton({rect: RECT, enabled: () => false, onClick}),
    ]);
    expect(press(set, "down", 20, 15)).toBe(false);
    press(set, "up", 20, 15);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("createSlider", () => {
  const make = (initial = 1) => {
    let value = initial;
    const onChange = vi.fn((v: number) => {
      value = v;
    });
    const slider = createSlider({
      rect: {x: 0, y: 0, width: 112, height: 30},
      min: 0,
      max: 2,
      step: 0.1,
      value: () => value,
      onChange,
    });
    return {
      slider,
      set: createControlSet([slider]),
      onChange,
      get: () => value,
    };
  };

  it("押した所へ飛び、つかんだまま動かすと値が変わる(step に丸める)", () => {
    const {set, get} = make();
    // 溝は x=6〜106(幅 100)。x=31 は 0.5
    press(set, "down", 31, 10);
    expect(get()).toBeCloseTo(0.5);
    press(set, "move", 83, 10);
    expect(get()).toBeCloseTo(1.5);
    press(set, "up", 83, 10);
    press(set, "move", 6, 10);
    expect(get()).toBeCloseTo(1.5);
  });

  it("溝の外へ動かしても端の値で止まる", () => {
    const {set, get} = make();
    press(set, "down", 50, 10);
    press(set, "move", -500, 10);
    expect(get()).toBe(0);
    press(set, "move", 5000, 10);
    expect(get()).toBe(2);
  });

  it("値が変わらない動きでは onChange を呼ばない", () => {
    const {set, onChange} = make(1);
    press(set, "down", 56, 10);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("つまみの位置は値に合わせる", () => {
    expect(make(0).slider.thumbX()).toBe(6);
    expect(make(2).slider.thumbX()).toBe(106);
    expect(make(1).slider.thumbX()).toBe(56);
  });
});

describe("createControlSet", () => {
  it("up を受け取れずに次の down が来たら、前の部品を手放す", () => {
    const onClick = vi.fn();
    const button = createButton({rect: RECT, onClick});
    const set = createControlSet([button]);
    press(set, "down", 20, 15);
    expect(press(set, "down", 300, 300)).toBe(true);
    expect(button.pressed()).toBe(false);
    press(set, "up", 20, 15);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cancel で、押しかけを何も起こさずにやめる", () => {
    const onClick = vi.fn();
    const button = createButton({rect: RECT, onClick});
    const set = createControlSet([button]);
    press(set, "down", 20, 15);
    set.cancel();
    expect(button.pressed()).toBe(false);
    press(set, "up", 20, 15);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("何も無い所を押しても受け取らない", () => {
    const set = createControlSet([
      createButton({rect: RECT, onClick: () => {}}),
    ]);
    expect(press(set, "down", 300, 300)).toBe(false);
    expect(press(set, "move", 20, 15)).toBe(false);
  });
});

describe("createDropdown", () => {
  const BOX = {x: 10, y: 10, width: 100, height: 20};
  const make = (bottomLimit = 200) => {
    let value: string | null = null;
    const onChange = vi.fn((v: string | null) => {
      value = v;
    });
    const dropdown = createDropdown<string | null>({
      rect: BOX,
      bottomLimit,
      choices: () => [
        {value: null, label: "既定"},
        {value: "a", label: "A"},
        {value: "b", label: "B"},
      ],
      value: () => value,
      onChange,
    });
    const set = createControlSet([dropdown]);
    return {dropdown, set, onChange, value: () => value};
  };
  const itemY = (index: number) =>
    BOX.y + BOX.height + 1 + index * DROPDOWN_ITEM_HEIGHT + 8;

  it("押すと開き、項目を押すと選んで閉じる", () => {
    const {dropdown, set, value} = make();
    press(set, "down", 20, 20);
    press(set, "up", 20, 20);
    expect(dropdown.open()).toBe(true);
    press(set, "down", 20, itemY(2));
    press(set, "up", 20, itemY(2));
    expect(value()).toBe("b");
    expect(dropdown.open()).toBe(false);
  });

  it("押したまま項目までずらして離しても選べる", () => {
    const {set, value} = make();
    press(set, "down", 20, 20);
    press(set, "move", 20, itemY(1));
    press(set, "up", 20, itemY(1));
    expect(value()).toBe("a");
  });

  it("同じ項目を選び直しても onChange は呼ばない", () => {
    const {set, onChange} = make();
    press(set, "down", 20, 20);
    press(set, "up", 20, 20);
    press(set, "down", 20, itemY(0));
    press(set, "up", 20, itemY(0));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("下に入りきらなければ上へ開く", () => {
    const {dropdown, set} = make(60);
    press(set, "down", 20, 20);
    expect(dropdown.popup?.()?.y).toBeLessThan(BOX.y);
  });

  it("開いている間にほかを押すと、閉じるだけでほかの部品には届かない", () => {
    const {dropdown} = make();
    const onClick = vi.fn();
    const button = createButton({
      rect: {x: 150, y: 10, width: 40, height: 20},
      onClick,
    });
    const set = createControlSet([dropdown, button]);
    press(set, "down", 20, 20);
    press(set, "up", 20, 20);
    press(set, "down", 160, 15);
    press(set, "up", 160, 15);
    expect(dropdown.open()).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("createTabs", () => {
  it("押したタブを選ぶ", () => {
    let selected = 0;
    const tabs = createTabs({
      rect: {x: 0, y: 0, width: 200, height: 18},
      widths: [50, 60, 70],
      selected: () => selected,
      onSelect: (i) => {
        selected = i;
      },
    });
    const set = createControlSet([tabs]);
    press(set, "down", 55, 5);
    press(set, "up", 55, 5);
    expect(selected).toBe(1);
    press(set, "down", 150, 5);
    expect(selected).toBe(2);
  });
});
