import {BackSide, MeshBasicMaterial} from "three";

import {setSkipGTAO} from "../camera/postprocess/skipGTAO";
import {FILE_KIND, parseFileData} from "./file";
import type {Item} from "./types";

// 骨格と同じく、白い身体に暗い縁取り。GTAO は掛けない(掛かると白が灰色になる)
const FILL_MATERIAL = new MeshBasicMaterial({color: "#ffffff"});
const OUTLINE_COLOR = "#1a1a1a";
const OUTLINE_MATERIAL = new MeshBasicMaterial({
  color: OUTLINE_COLOR,
  side: BackSide,
});
setSkipGTAO(FILL_MATERIAL, true);
setSkipGTAO(OUTLINE_MATERIAL, true);

// ファイルは、縁の色で識別する(色は取り出し元のファイルだけが持つ)。色の数は有限なので、色ごとに使い回す
const fileOutlines = new Map<string, MeshBasicMaterial>();
const fileOutline = (color: string): MeshBasicMaterial => {
  let material = fileOutlines.get(color);
  if (!material) {
    material = new MeshBasicMaterial({color, side: BackSide});
    setSkipGTAO(material, true);
    fileOutlines.set(color, material);
  }
  return material;
};

const outlineOf = (item: Item): MeshBasicMaterial => {
  if (item.kind !== FILE_KIND) {
    return OUTLINE_MATERIAL;
  }
  const color = parseFileData(item.data)?.color;
  return color === undefined ? OUTLINE_MATERIAL : fileOutline(color);
};

/** 一辺(m)。両手首の間隔(0.14)より小さくして、両手で挟む */
const SIZE = 0.1;
const OUTLINE_SCALE = 1.12;

/**
 * 手元に出すアイテムのメッシュ。今は kind によらずダミーの箱(kind ごとの見た目は、種類が決まってから)。
 * ファイルは、縁の色を data.color にする(色が無ければ従来の暗い縁)
 */
export function HeldItem({item}: {item: Item}) {
  return (
    <group name={`held-item:${item.kind}`}>
      <mesh material={FILL_MATERIAL} frustumCulled={false}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
      <mesh
        material={outlineOf(item)}
        scale={OUTLINE_SCALE}
        frustumCulled={false}
      >
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
    </group>
  );
}
