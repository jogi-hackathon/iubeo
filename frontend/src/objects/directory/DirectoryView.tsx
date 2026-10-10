import {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {BoxGeometry, Color, type InstancedMesh, Object3D} from "three";
import {color as colorNode} from "three/tsl";
import {MeshStandardNodeMaterial} from "three/webgpu";

import {BakeTarget} from "../../bake/BakeTarget";
import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {BVHCollider} from "../../core/bvh";
import {applyCorruption} from "./corruption";
import {DirectoryOverview} from "./DirectoryOverview";
import {type Sheet} from "./mountain";
import {createPaperMaterial, setSheetInfo} from "./paperMaterial";
import type {DirectoryModel} from "./useDirectory";

const CORE_COLOR = "#e4e4e1";

/** 芯のマテリアル。燃える演出の侵食(corruption.ts)を重ねる */
const createCoreMaterial = (): MeshStandardNodeMaterial => {
  const m = new MeshStandardNodeMaterial({flatShading: true});
  applyCorruption(m, colorNode(CORE_COLOR).rgb);
  return m;
};

const dummy = new Object3D();
const color = new Color();

type StackProps = {
  sheets: readonly Sheet[];
  count: number;
};

/**
 * 成果物の板(白い薄い本)。数が増減するので、ベイクには入れず、InstancedMesh で先頭から count 枚だけ見せる。
 * 薄い板なので AO は付けない(GTAO も掛けない。山の他の面はベイク AO だけなので、ここだけ GTAO のノイズが乗るのを避ける)
 */
function OutputSheets({sheets, count}: StackProps) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => {
    const m = createPaperMaterial({merged: false});
    setSkipGTAO(m, true);
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    setSheetInfo(
      g,
      sheets.map((s) => s.size),
    );
    return g;
  }, [sheets]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    sheets.forEach((s, i) => {
      dummy.position.set(...s.position);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(...s.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(s.color));
    });
    mesh.count = Math.min(count, sheets.length);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [sheets, count]);

  return <instancedMesh ref={ref} args={[geometry, material, sheets.length]} />;
}

/**
 * ディレクトリの見た目(山・成果物の板・俯瞰ビュー)。大きさ(look)ごとの SmallDirectory・LargeDirectory が、useDirectory の値を渡して描く。
 * 段々の芯はコライダー、束と紙はベイク対象(BakeTarget)、成果物の板は InstancedMesh(ベイクしない)
 */
export function DirectoryView({
  objectId,
  position,
  look,
  stock,
  outputs,
  mountain,
  coreGeometry,
  sheetsGeometry,
  paperMaterial,
  overviewing,
  visible,
}: DirectoryModel) {
  const coreMaterial = useMemo(createCoreMaterial, []);
  useEffect(() => () => coreMaterial.dispose(), [coreMaterial]);
  return (
    <group>
      <BVHCollider enabled={visible}>
        <mesh geometry={coreGeometry} material={coreMaterial} />
      </BVHCollider>
      <BakeTarget>
        <mesh geometry={sheetsGeometry} material={paperMaterial} />
      </BakeTarget>
      <OutputSheets sheets={mountain.outputSheets} count={outputs} />
      {overviewing && (
        <DirectoryOverview
          directoryId={objectId}
          position={position}
          candidates={mountain.candidates}
          size={look}
          stock={stock}
        />
      )}
    </group>
  );
}
