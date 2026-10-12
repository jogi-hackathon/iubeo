import type {CSSProperties} from "react";

import {
  activeTabOf,
  registerDevTab,
  selectDevTab,
  useDevPanel,
} from "./devPanel";
import {
  DEBUG_AVAILABLE,
  type DebugFlags,
  setDebugFlag,
  useDebugFlags,
} from "./flags";
import {Check} from "./ui";

const dockStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  maxHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  width: 360,
  font: "11px/1.5 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.75)",
  zIndex: 10001,
};
const tabBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255,255,255,0.3)",
};
const tabStyle: CSSProperties = {
  padding: "4px 8px",
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  opacity: 0.6,
};
const activeTabStyle: CSSProperties = {
  ...tabStyle,
  opacity: 1,
  background: "rgba(255,255,255,0.15)",
};
const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 8px",
};

const VIEW_FLAGS: readonly {key: keyof DebugFlags; label: string}[] = [
  {key: "stats", label: "stats (F6)"},
  {key: "grid", label: "grid (F6)"},
  {key: "bvh", label: "BVH bounds"},
  {key: "freeCamera", label: "free camera (F8)"},
];

function ViewTab() {
  const flags = useDebugFlags();
  return (
    <>
      {VIEW_FLAGS.map(({key, label}) => (
        <Check
          key={key}
          label={label}
          checked={flags[key]}
          onChange={(v) => setDebugFlag(key, v)}
        />
      ))}
    </>
  );
}

registerDevTab({id: "view", label: "View", order: 0, Component: ViewTab});

export function DevPanelManager() {
  const panel = useDevPanel();
  const active = activeTabOf(panel);
  if (!DEBUG_AVAILABLE || !panel.open || !active) {
    return null;
  }
  return (
    <div style={dockStyle}>
      <div style={tabBarStyle}>
        {panel.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            style={tab === active ? activeTabStyle : tabStyle}
            onClick={() => selectDevTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={bodyStyle}>
        <active.Component key={active.id} />
      </div>
    </div>
  );
}
