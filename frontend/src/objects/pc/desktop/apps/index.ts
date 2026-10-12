import type {AppView, DesktopApp} from "../kernel/app";
import {COLORS} from "../theme/classic";

// TODO(desktop): マッチングと設定の中身は次の段で作る。それまでは窓が開くことだけを確かめる仮の中身
const placeholder = (): AppView => ({
  paint: (ctx, {width, height}) => {
    ctx.fillStyle = COLORS.grayText;
    ctx.textAlign = "center";
    ctx.fillText("準備中", width / 2, height / 2);
    ctx.textAlign = "left";
  },
});

export const DESKTOP_APPS: readonly DesktopApp[] = [
  {
    id: "matchmaking",
    title: "マッチング",
    icon: "matchmaking",
    size: {width: 300, height: 180},
    open: placeholder,
  },
  {
    id: "settings",
    title: "設定",
    icon: "settings",
    size: {width: 280, height: 160},
    open: placeholder,
  },
];
