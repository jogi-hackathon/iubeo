import {type ComponentType, useSyncExternalStore} from "react";

import {DEBUG_AVAILABLE} from "./flags";

export interface DevTab {
  id: string;
  label: string;
  order: number;
  Component: ComponentType;
}

interface DevPanelState {
  open: boolean;
  tabId: string | null;
  tabs: readonly DevTab[];
}

const STORAGE_KEY = "iubeo:devPanel";

const loadSaved = (): Pick<DevPanelState, "open" | "tabId"> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    const {open, tabId} = parsed as Record<string, unknown>;
    return {
      open: open === true,
      tabId: typeof tabId === "string" ? tabId : null,
    };
  } catch {
    return {open: false, tabId: null};
  }
};

let state: DevPanelState = {...loadSaved(), tabs: []};
const listeners = new Set<() => void>();

const setState = (next: Partial<DevPanelState>): void => {
  state = {...state, ...next};
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({open: state.open, tabId: state.tabId}),
    );
  } catch {}
  for (const l of listeners) {
    l();
  }
};

export const registerDevTab = (tab: DevTab): void => {
  if (!DEBUG_AVAILABLE) {
    return;
  }
  const tabs = [...state.tabs.filter((t) => t.id !== tab.id), tab].sort(
    (a, b) => a.order - b.order,
  );
  setState({tabs});
};

export const activeTabOf = (s: DevPanelState): DevTab | undefined =>
  s.tabs.find((t) => t.id === s.tabId) ?? s.tabs[0];

export const toggleDevPanel = (): void => {
  setState({open: !state.open});
};

export const selectDevTab = (tabId: string): void => {
  setState({tabId});
};

export const cycleDevTab = (): void => {
  const current = activeTabOf(state);
  if (!current) {
    return;
  }
  if (!state.open) {
    setState({open: true});
    return;
  }
  const {tabs} = state;
  const next = tabs[(tabs.indexOf(current) + 1) % tabs.length] ?? current;
  setState({tabId: next.id});
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useDevPanel = (): DevPanelState =>
  useSyncExternalStore(subscribe, () => state);
