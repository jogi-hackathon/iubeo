import {mouseSettingsStore} from "../../../core/input/mouseSettings";
import type {GameFlowState} from "../../../flow";
import {NO_MODIFIERS} from "../display/types";
import {createDesktopApps} from "./apps";
import type {MatchmakingPort} from "./apps/matchmaking";
import {DesktopScreen} from "./DesktopScreen";
import {SCREEN} from "./kernel/layout";

// dev 専用(desktop.html)。PC の 3D を通さずに、デスクトップを平面のまま本物のマウスで触る。
// 2 倍に拡大して並べ、カーソルはデスクトップが自分で描くので、本物のカーソルは隠す。
// マッチングはサーバーへつながず、下のボタンで状態を切り替える偽物を使う
const SCALE = 2;

const createFakeFlow = () => {
  let state: GameFlowState = {status: "idle"};
  const listeners = new Set<() => void>();
  let timer: number | undefined;
  const set = (next: GameFlowState) => {
    window.clearTimeout(timer);
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };
  const flow: MatchmakingPort & {set: (next: GameFlowState) => void} = {
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    startMatchmaking: () => {
      set({status: "issuing"});
      timer = window.setTimeout(
        () =>
          set({
            status: "queued",
            playerId: "dev",
            queuedAt: new Date().toISOString(),
          }),
        800,
      );
    },
    cancelMatchmaking: () => set({status: "idle"}),
    set,
  };
  return flow;
};

const flow = createFakeFlow();
const screen = new DesktopScreen(
  createDesktopApps({flow, mouse: mouseSettingsStore}),
);
const surface = screen.surface;
surface.style.cssText = [
  `width:${SCREEN.width * SCALE}px`,
  `height:${SCREEN.height * SCALE}px`,
  "image-rendering:pixelated",
  "cursor:none",
  "display:block",
].join(";");

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
document.body.style.cssText = "margin:0;padding:24px;background:#202020";
root.appendChild(surface);
const panel = document.createElement("div");
panel.style.cssText = "margin-top:12px;display:flex;gap:8px;flex-wrap:wrap";
const STATES: Array<[string, GameFlowState]> = [
  ["待機", {status: "idle"}],
  ["接続中", {status: "issuing"}],
  [
    "待っている",
    {status: "queued", playerId: "dev", queuedAt: new Date().toISOString()},
  ],
  ["接続先が決まった", {status: "matched", playerId: "dev", sessionId: "s"}],
  ["エラー", {status: "error", message: "502 Bad Gateway"}],
  ["解散の通知", {status: "idle", notice: "dissolved"}],
];
for (const [label, next] of STATES) {
  const button = document.createElement("button");
  button.textContent = `接続: ${label}`;
  button.addEventListener("click", () => flow.set(next));
  panel.appendChild(button);
}
root.appendChild(panel);

const send = (type: "move" | "down" | "up", event: MouseEvent) => {
  const rect = surface.getBoundingClientRect();
  screen.pointer({
    type,
    x: Math.max(
      0,
      Math.min(SCREEN.width - 1, (event.clientX - rect.left) / SCALE),
    ),
    y: Math.max(
      0,
      Math.min(SCREEN.height - 1, (event.clientY - rect.top) / SCALE),
    ),
    button: type === "move" ? -1 : event.button,
    buttons: event.buttons,
    clickCount: event.detail,
    modifiers: NO_MODIFIERS,
  });
};
surface.addEventListener("mousemove", (e) => send("move", e));
surface.addEventListener("mousedown", (e) => send("down", e));
window.addEventListener("mouseup", (e) => send("up", e));
surface.addEventListener("contextmenu", (e) => e.preventDefault());

const frame = () => {
  screen.tick();
  requestAnimationFrame(frame);
};
frame();

(globalThis as {__desktop?: DesktopScreen}).__desktop = screen;
