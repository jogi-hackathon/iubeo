import { useEffect, useState } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { BVHCollider } from "../core/bvh";

interface TiledFloorProps {
  size?: number;
  thickness?: number;
  tileSize?: number;
}

const createTileTexture = (repeat: number) => {
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = "#c4c4c4";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, px, px);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
};

/** 上面が y=0 の平らな床。淡い格子線のタイル付き。BVH コライダー込み */
export function TiledFloor({
  size = 200,
  thickness = 1,
  tileSize = 2,
}: TiledFloorProps) {
  const [tiles, setTiles] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    const texture = createTileTexture(size / tileSize);
    setTiles(texture);
    return () => texture.dispose();
  }, [size, tileSize]);

  return (
    <BVHCollider>
      <mesh position={[0, -thickness / 2, 0]}>
        <boxGeometry args={[size, thickness, size]} />
        <meshStandardMaterial map={tiles} />
      </mesh>
    </BVHCollider>
  );
}
