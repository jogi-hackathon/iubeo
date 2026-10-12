import type {AppPointerEvent} from "../kernel/app";
import {clamp, contains, type Rect} from "../kernel/geometry";

export interface Control {
  readonly rect: Rect;
  enabled(): boolean;
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number): void;
  cancel(): void;
}

export type Button = Control & {
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
  thumbX(): number;
};

const SLIDER_MARGIN = 6;

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

export const createControlSet = (controls: readonly Control[]) => {
  let captured: Control | null = null;
  const cancel = () => {
    captured?.cancel();
    captured = null;
  };
  return {
    controls,
    cancel,
    pointer: (event: AppPointerEvent): boolean => {
      const {x, y} = event;
      if (event.type === "down") {
        const released = captured !== null;
        cancel();
        const hit = controls.find((c) => c.enabled() && contains(c.rect, x, y));
        if (!hit) {
          return released;
        }
        captured = hit;
        hit.down(x, y);
        return true;
      }
      if (!captured) {
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
