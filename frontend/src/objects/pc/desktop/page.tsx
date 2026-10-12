import {NO_MODIFIERS} from "../display/types";
import {DESKTOP_APPS} from "./apps";
import {DesktopScreen} from "./DesktopScreen";
import {SCREEN} from "./kernel/layout";

// dev 専用(desktop.html)。PC の 3D を通さずに、デスクトップを平面のまま本物のマウスで触る。
// 2 倍に拡大して並べ、カーソルはデスクトップが自分で描くので、本物のカーソルは隠す
const SCALE = 2;

const screen = new DesktopScreen(DESKTOP_APPS);
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
const log = document.createElement("pre");
log.style.cssText = "color:#ccc;font:12px monospace";
root.appendChild(log);
screen.shell.onLeave(() => {
  log.textContent = `${new Date().toLocaleTimeString()} シャットダウン(PC から離れる)\n${log.textContent}`;
});

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
