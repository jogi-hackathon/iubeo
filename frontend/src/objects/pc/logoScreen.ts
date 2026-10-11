import {CanvasTexture, SRGBColorSpace} from "three/webgpu";

import {SCREEN_CANVAS} from "../../screen/browserChrome";

export const createLogoTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_CANVAS.width;
  canvas.height = SCREEN_CANVAS.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 160px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("IUBEO", canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};
