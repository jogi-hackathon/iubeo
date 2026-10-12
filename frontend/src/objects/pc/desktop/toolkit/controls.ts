import type {AppPointerEvent} from "../kernel/app";
import {clamp, contains, type Rect} from "../kernel/geometry";

/**
 * 窓の中身に置く部品。押した部品が離すまで入力を受け取る(外へずらしても)。
 * 見た目は paint/controls.ts。ここは押す・つかむの解釈だけを持つ
 */
export interface Control {
  readonly rect: Rect;
  enabled(): boolean;
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number): void;
  /** 押しかけ・つかみかけを、何も起こさずにやめる(PC から離れたときなど) */
  cancel(): void;
  popup?(): Rect | null;
  hover?(x: number, y: number): void;
  dismiss?(): void;
}

export type Button = Control & {
  /** 押していて、まだボタンの上にある(へこんで見せる) */
  pressed(): boolean;
};

export const createButton = ({
  rect,
  enabled = () => true,
  onClick,
}: {
  rect: Rect;
  enabled?: () => boolean;
  onClick: () => void;
}): Button => {
  let holding = false;
  let inside = false;
  return {
    rect,
    enabled,
    pressed: () => holding && inside,
    down: () => {
      holding = true;
      inside = true;
    },
    move: (x, y) => {
      inside = contains(rect, x, y);
    },
    up: (x, y) => {
      const click = holding && contains(rect, x, y);
      holding = false;
      inside = false;
      if (click) {
        onClick();
      }
    },
    cancel: () => {
      holding = false;
      inside = false;
    },
  };
};

export type Slider = Control & {
  value(): number;
  /** つまみの中心の x(rect の中) */
  thumbX(): number;
};

const SLIDER_MARGIN = 6;

/** 横のスライダー。押した所へつまみを飛ばし、つかんだまま動かす。値は step に丸める */
export const createSlider = ({
  rect,
  min,
  max,
  step,
  value,
  onChange,
  enabled = () => true,
}: {
  rect: Rect;
  min: number;
  max: number;
  step: number;
  value: () => number;
  onChange: (value: number) => void;
  enabled?: () => boolean;
}): Slider => {
  const left = rect.x + SLIDER_MARGIN;
  const width = rect.width - SLIDER_MARGIN * 2;
  const valueAt = (x: number): number => {
    const t = clamp((x - left) / width, 0, 1);
    const raw = min + t * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    return clamp(Number(snapped.toFixed(6)), min, max);
  };
  let holding = false;
  const set = (x: number) => {
    const next = valueAt(x);
    if (next !== value()) {
      onChange(next);
    }
  };
  return {
    rect,
    enabled,
    value,
    thumbX: () =>
      left + ((clamp(value(), min, max) - min) / (max - min)) * width,
    down: (x) => {
      holding = true;
      set(x);
    },
    move: (x) => {
      if (holding) {
        set(x);
      }
    },
    up: () => {
      holding = false;
    },
    cancel: () => {
      holding = false;
    },
  };
};

export type Choice<T> = {value: T; label: string};

export type Tabs = Control & {
  selected(): number;
  tabRect(index: number): Rect;
  readonly count: number;
};

export const createTabs = ({
  rect,
  widths,
  selected,
  onSelect,
}: {
  rect: Rect;
  widths: readonly number[];
  selected: () => number;
  onSelect: (index: number) => void;
}): Tabs => {
  const lefts = widths.map((_, i) =>
    widths.slice(0, i).reduce((sum, w) => sum + w, rect.x),
  );
  const tabRect = (index: number): Rect => ({
    x: lefts[index]!,
    y: rect.y,
    width: widths[index]!,
    height: rect.height,
  });
  return {
    rect,
    count: widths.length,
    enabled: () => true,
    selected,
    tabRect,
    down: (x, y) => {
      const index = widths.findIndex((_, i) => contains(tabRect(i), x, y));
      if (index >= 0 && index !== selected()) {
        onSelect(index);
      }
    },
    move: () => {},
    up: () => {},
    cancel: () => {},
  };
};

export type Dropdown<T> = Control & {
  open(): boolean;
  choices(): readonly Choice<T>[];
  selectedLabel(): string;
  highlighted(): number;
  itemRect(index: number): Rect;
};

export const DROPDOWN_ITEM_HEIGHT = 16;

export const createDropdown = <T>({
  rect,
  choices,
  value,
  onChange,
  bottomLimit,
  enabled = () => true,
}: {
  rect: Rect;
  choices: () => readonly Choice<T>[];
  value: () => T;
  onChange: (value: T) => void;
  bottomLimit: number;
  enabled?: () => boolean;
}): Dropdown<T> => {
  let isOpen = false;
  let highlight = -1;
  let openedByThisPress = false;

  const listRect = (): Rect => {
    const height = choices().length * DROPDOWN_ITEM_HEIGHT + 2;
    const below = rect.y + rect.height;
    const y =
      below + height <= bottomLimit ? below : Math.max(0, rect.y - height);
    return {x: rect.x, y, width: rect.width, height};
  };
  const itemRect = (index: number): Rect => {
    const list = listRect();
    return {
      x: list.x + 1,
      y: list.y + 1 + index * DROPDOWN_ITEM_HEIGHT,
      width: list.width - 2,
      height: DROPDOWN_ITEM_HEIGHT,
    };
  };
  const itemAt = (x: number, y: number): number =>
    isOpen ? choices().findIndex((_, i) => contains(itemRect(i), x, y)) : -1;
  const selectedIndex = () =>
    choices().findIndex((c) => Object.is(c.value, value()));
  const close = () => {
    isOpen = false;
    highlight = -1;
  };

  return {
    rect,
    enabled,
    open: () => isOpen,
    choices,
    highlighted: () => highlight,
    itemRect,
    selectedLabel: () => choices()[selectedIndex()]?.label ?? "",
    popup: () => (isOpen ? listRect() : null),
    hover: (x, y) => {
      const index = itemAt(x, y);
      if (index >= 0) {
        highlight = index;
      }
    },
    dismiss: close,
    down: (x, y) => {
      if (isOpen && itemAt(x, y) >= 0) {
        highlight = itemAt(x, y);
        openedByThisPress = false;
        return;
      }
      if (isOpen) {
        close();
        return;
      }
      isOpen = true;
      openedByThisPress = true;
      highlight = selectedIndex();
    },
    move: (x, y) => {
      const index = itemAt(x, y);
      if (index >= 0) {
        highlight = index;
      }
    },
    up: (x, y) => {
      const index = itemAt(x, y);
      if (index < 0) {
        if (!openedByThisPress) {
          close();
        }
        openedByThisPress = false;
        return;
      }
      const choice = choices()[index]!;
      close();
      openedByThisPress = false;
      if (!Object.is(choice.value, value())) {
        onChange(choice.value);
      }
    },
    cancel: () => {
      close();
      openedByThisPress = false;
    },
  };
};

const hits = (c: Control, x: number, y: number): boolean => {
  const popup = c.popup?.();
  return contains(c.rect, x, y) || (popup != null && contains(popup, x, y));
};

/** 部品をまとめ、窓の中身への入力を、押した部品へ届ける */
export const createControlSet = (
  source: readonly Control[] | (() => readonly Control[]),
) => {
  const current = typeof source === "function" ? source : () => source;
  let captured: Control | null = null;
  const openPopup = () => current().find((c) => c.popup?.() != null);
  const cancel = () => {
    captured?.cancel();
    captured = null;
    openPopup()?.cancel();
  };
  return {
    get controls() {
      return current();
    },
    cancel,
    /** 入力を部品へ渡す。どれかの部品が受け取ったら true(描き直しの目安) */
    pointer: (event: AppPointerEvent): boolean => {
      const {x, y} = event;
      if (event.type === "down") {
        // 前の押しかけが残っていたら(up を受け取れなかったとき)、ここで手放す
        const released = captured !== null;
        captured?.cancel();
        captured = null;
        const popped = openPopup();
        if (popped && !hits(popped, x, y)) {
          popped.dismiss?.();
          return true;
        }
        const hit =
          popped ??
          current().find((c) => c.enabled() && contains(c.rect, x, y));
        if (!hit) {
          return released;
        }
        captured = hit;
        hit.down(x, y);
        return true;
      }
      if (!captured) {
        const popped = openPopup();
        if (event.type === "move" && popped?.hover) {
          popped.hover(x, y);
          return true;
        }
        return false;
      }
      if (event.type === "move") {
        captured.move(x, y);
        return true;
      }
      const target = captured;
      captured = null;
      target.up(x, y);
      return true;
    },
  };
};
