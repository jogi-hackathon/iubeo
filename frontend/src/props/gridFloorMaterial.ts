import {useEffect, useMemo} from "react";
import {CanvasTexture, RepeatWrapping, SRGBColorSpace} from "three";
import {positionWorld, texture} from "three/tsl";
import {MeshStandardNodeMaterial} from "three/webgpu";

import {PROP_COLOR} from "./types";

const createTileTexture = () => {
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = PROP_COLOR;
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = "#dcdcdc";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, px, px);
  }
  const tile = new CanvasTexture(canvas);
  tile.colorSpace = SRGBColorSpace;
  tile.wrapS = tile.wrapT = RepeatWrapping;
  tile.anisotropy = 8;
  return tile;
};

export const createGridFloorMaterial = (tileSize: number) => {
  const tile = createTileTexture();
  const material = new MeshStandardNodeMaterial();
  material.colorNode = texture(tile, positionWorld.xz.div(tileSize));
  return {
    material,
    dispose: () => {
      material.dispose();
      tile.dispose();
    },
  };
};

/**
 * 壁と同じ地の色に淡い格子線の、方眼の床のマテリアル。
 * uv ではなくワールドの xz で引く(Slab の uv は面いっぱいに引き伸ばすのでマス目が歪むのと、回した区画どうしでもマス目をつなげるため)。
 * ノードのマテリアルにする(焼いた後で消えた物の影を、ベイク AO から消せるように。bake/aoErase)
 */
export const useGridFloorMaterial = (tileSize: number) => {
  const grid = useMemo(() => createGridFloorMaterial(tileSize), [tileSize]);
  useEffect(() => grid.dispose, [grid]);
  return grid.material;
};
