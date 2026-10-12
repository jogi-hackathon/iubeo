export const COLORS = {
  desktop: "#a4a4a4",
  face: "#d0d0d0",
  highlight: "#ffffff",
  shadow: "#808080",
  darkShadow: "#404040",
  text: "#000000",
  grayText: "#808080",
  window: "#ffffff",
  selection: "#202020",
  selectionText: "#ffffff",
  activeTitle: ["#1a1a1a", "#9a9a9a"],
  inactiveTitle: ["#808080", "#c0c0c0"],
  activeTitleText: "#ffffff",
  inactiveTitleText: "#d0d0d0",
  desktopText: "#000000",
  banner: ["#000000", "#707070"],
} as const;

const FAMILY =
  'Tahoma, "MS UI Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif';

export const FONT = `12px ${FAMILY}`;
export const FONT_BOLD = `bold 12px ${FAMILY}`;
export const FONT_BANNER = `bold 15px ${FAMILY}`;
