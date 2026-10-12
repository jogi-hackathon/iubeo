import {
  CanvasTexture,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three/webgpu";

import logoUrl from "../../../assets/brand/iubeo_logo.svg";
import {setSkipGTAO} from "../../../camera/postprocess/skipGTAO";
import {registerShaderSwatch} from "../../../core/shaderSwatches";
import {LOGO_INK} from "../../../objects/pc/bootScreen";
import type {CreditLine} from "./content";
import {BOARD_WIDTH, type CreditLayout} from "./roll";

/** 板の解像度(px/m)。窓越しの距離で文字がつぶれない程度 */
const PX_PER_M = 192;
const INK = "#1a1a1a";
const SUB_INK = "#6a6a6a";
const FONT_FAMILY = `ui-monospace, Menlo, "Hiragino Sans", monospace`;
const LOGO_WIDTH_M = 3;

/** 行の種類ごとの文字の大きさ(m)と色 */
const TEXT_STYLE: Record<
  "heading" | "item",
  {size: number; color: string; weight: string}
> = {
  heading: {size: 0.2, color: SUB_INK, weight: "bold"},
  item: {size: 0.24, color: INK, weight: "normal"},
};

/** 空に浮かべる板のマテリアル。霧で白く霞まないようにし、明るさは描いた色のまま出す */
export const createBoardMaterial = (map: CanvasTexture): Material => {
  const m = new MeshBasicMaterial({
    map,
    transparent: true,
    fog: false,
    toneMapped: false,
    depthWrite: false,
  });
  setSkipGTAO(m, true);
  return m;
};

// クレジットは流れ出すまでマウントされないので、見本をウォームアップに描かせる
registerShaderSwatch(
  "skyCredits",
  () =>
    new Mesh(
      new PlaneGeometry(1, 1),
      createBoardMaterial(new CanvasTexture(document.createElement("canvas"))),
    ),
);

const tintedLogo = (image: HTMLImageElement): HTMLCanvasElement => {
  // ロゴの SVG は白い線(PC の黒い起動画面用)なので、白い空に合わせて墨色に塗り替える
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(LOGO_WIDTH_M * PX_PER_M);
  canvas.height = Math.round((canvas.width * LOGO_INK.height) / LOGO_INK.width);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(
      image,
      LOGO_INK.x,
      LOGO_INK.y,
      LOGO_INK.width,
      LOGO_INK.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
};

/** クレジット全体を 1 枚に描いた板。ロゴは読み込めたら描き足す */
export class CreditBoard {
  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private logo: HTMLCanvasElement | null = null;

  constructor(private readonly layout: CreditLayout) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(BOARD_WIDTH * PX_PER_M);
    this.canvas.height = Math.round(layout.height * PX_PER_M);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.paint();
    const image = new Image();
    image.src = logoUrl;
    // dispose 後に描き足しても、テクスチャは次に使われたときに送り直されるだけなので止めない(StrictMode は一度 dispose してから使い直す)
    void image.decode().then(() => {
      this.logo = tintedLogo(image);
      this.paint();
    });
  }

  private paint(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const {width, height} = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const {line, top, height: h} of this.layout.rows) {
      this.paintLine(ctx, line, (top + h / 2) * PX_PER_M);
    }
    this.texture.needsUpdate = true;
  }

  private paintLine(
    ctx: CanvasRenderingContext2D,
    line: CreditLine,
    y: number,
  ): void {
    const x = this.canvas.width / 2;
    if (line.type === "gap" || line.type === "opening") {
      return;
    }
    if (line.type === "logo") {
      if (this.logo) {
        ctx.drawImage(
          this.logo,
          x - this.logo.width / 2,
          y - this.logo.height / 2,
        );
      }
      return;
    }
    const style = TEXT_STYLE[line.type];
    ctx.fillStyle = style.color;
    ctx.font = `${style.weight} ${Math.round(style.size * PX_PER_M)}px ${FONT_FAMILY}`;
    ctx.fillText(line.text, x, y);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
