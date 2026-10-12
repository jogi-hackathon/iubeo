/** Windows 2000 の「クラシック」配色 */
export const COLORS = {
  desktop: "#3a6ea5",
  face: "#d4d0c8",
  highlight: "#ffffff",
  shadow: "#808080",
  darkShadow: "#404040",
  text: "#000000",
  grayText: "#808080",
  window: "#ffffff",
  selection: "#0a246a",
  selectionText: "#ffffff",
  activeTitle: ["#0a246a", "#a6caf0"],
  inactiveTitle: ["#808080", "#c0c0c0"],
  activeTitleText: "#ffffff",
  inactiveTitleText: "#d4d0c8",
  desktopText: "#ffffff",
  banner: ["#000080", "#1084d0"],
} as const;

const FAMILY =
  'Tahoma, "MS UI Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif';

export const FONT = `12px ${FAMILY}`;
export const FONT_BOLD = `bold 12px ${FAMILY}`;
export const FONT_BANNER = `bold 15px ${FAMILY}`;
