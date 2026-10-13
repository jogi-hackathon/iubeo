import {useSyncExternalStore} from "react";

export type PcPower = "off" | "booting" | "on";

export type PcPowerOptions = {
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
};

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export const createPcPower = ({
  now = () => performance.now(),
  schedule = defaultSchedule,
}: PcPowerOptions = {}) => {
  let power: PcPower = "on";
  let boot = {startedAt: 0, ms: 0};
  let cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: PcPower) => {
    cancel?.();
    cancel = null;
    if (power === next) {
      return;
    }
    power = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    get: (): PcPower => power,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    elapsed: (): number =>
      power === "booting"
        ? Math.min(boot.ms, Math.max(0, now() - boot.startedAt))
        : 0,
    boot: (ms: number): void => {
      if (power !== "off") {
        return;
      }
      boot = {startedAt: now(), ms};
      set("booting");
      cancel = schedule(() => set("on"), ms);
    },
    turnOn: (): void => set("on"),
    turnOff: (): void => set("off"),
  };
};

export type PcPowerStore = ReturnType<typeof createPcPower>;

export const pcPower = createPcPower();

export const usePcPower = (): PcPower =>
  useSyncExternalStore(pcPower.subscribe, pcPower.get);
