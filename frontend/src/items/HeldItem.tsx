import {BackSide, MeshBasicMaterial} from "three";

import {setSkipGTAO} from "../camera/postprocess/skipGTAO";
import type {Item} from "./types";

// 骨格と同じく、白い身体に暗い縁取り。GTAO は掛けない(掛かると白が灰色になる)
const FILL_MATERIAL = new MeshBasicMaterial({color: "#ffffff"});
const OUTLINE_MATERIAL = new MeshBasicMaterial({
  color: "#1a1a1a",
  side: BackSide,
});
setSkipGTAO(FILL_MATERIAL, true);
setSkipGTAO(OUTLINE_MATERIAL, true);

/** 一辺(m)。両手首の間隔(0.14)より小さくして、両手で挟む */
const SIZE = 0.1;
const OUTLINE_SCALE = 1.12;

/** 手元に出すアイテムのメッシュ。今は kind によらずダミーの箱(kind ごとの見た目は、種類が決まってから) */
export function HeldItem({item}: {item: Item}) {
  return (
    <group name={`held-item:${item.kind}`}>
      <mesh material={FILL_MATERIAL} frustumCulled={false}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
      <mesh
        material={OUTLINE_MATERIAL}
        scale={OUTLINE_SCALE}
        frustumCulled={false}
      >
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
    </group>
  );
}
