import {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type InstancedMesh,
  Object3D,
} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {BVHCollider} from "../../core/bvh";
import type {GameObject} from "../types";
import {parseDirectoryData} from "./data";
import {DirectoryOverview} from "./DirectoryOverview";
import {
  buildMountain,
  type CoreMesh,
  type LooseSheet,
  type Sheet,
} from "./mountain";
import {overview, useIsOverviewing, useOverviewDirectoryId} from "./overview";
import {createPaperMaterial, setSheetInfo} from "./paperMaterial";

/** 芯の色。板より一段暗い紙色にして、散りばめた板が見分けられるようにする */
const CORE_COLOR = "#d9d5c9";

const dummy = new Object3D();
const color = new Color();

const buildCoreGeometry = ({positions, indices}: CoreMesh): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
};

type StackProps = {
  sheets: readonly Sheet[];
  /** 見せる数(先頭から) */
  count: number;
};

/**
 * 山の束の板。板ごとの位置・向き・大きさ・色は、InstancedMesh のインスタンスで持つ(1 回の描画)。
 * 側面には、紙を重ねた小口の細い横縞を、マテリアルで描く(paperMaterial。三角形は増えない)
 */
function SheetStack({sheets, count}: StackProps) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => createPaperMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  // 縞の間隔がワールド単位で一定になるよう、インスタンスごとの高さ(板の厚み)を属性で渡す
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    setSheetInfo(
      g,
      sheets.map((s) => s.size[1]),
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
    // 境界球は、フラスタムカリングと狙いの判定(raycast)が使う。作った時点の数で固定されるので、数が変わるたびに作り直す
    mesh.computeBoundingSphere();
  }, [sheets, count]);

  return <instancedMesh ref={ref} args={[geometry, material, sheets.length]} />;
}

/** 束からはみ出す薄い紙(厚さ数 mm)。縞は要らないので、普通のマテリアルで描く。傾きは Euler(順序 YXZ) */
function LooseSheets({sheets}: {sheets: readonly LooseSheet[]}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    dummy.rotation.order = "YXZ";
    sheets.forEach((s, i) => {
      dummy.position.set(...s.position);
      dummy.rotation.set(...s.rotation);
      dummy.scale.set(...s.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(s.color));
    });
    dummy.rotation.order = "XYZ";
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [sheets]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, sheets.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ffffff" />
    </instancedMesh>
  );
}

/**
 * ディレクトリ: 書類の束を段々(テラス)に積んだ山(手続き生成)。上へ行くほど狭くなる段の外周の帯に、束(薄い板の小さな山積み)を
 * ずらし・回して並べる。IUBEO は白い世界なので、束は紙の白で、側面には紙の層の細い縞を描く。
 *   段の縁や束から、薄い紙がはみ出す(差し色は、このはみ出し紙のごく少数だけ)。
 *
 * - 動的に増減するオブジェクトなのでベイクAOの対象外(realtime)。ManagedObjects の他の kind と同じ
 * - コライダーは、段々の芯(通常の Mesh)。束は InstancedMesh で BVH の対象にできないが、芯に載っているので、
 *   プレイヤーは芯に当たる(束のはみ出しは、コライダーの外)
 * - 成果物(outputs)は、下の方の段の束の上に板が増える。位置は id から決まり、増えても既存の板は動かない
 * - 在庫のファイルは、山の束の 1 つ 1 つ。一人称では白いままで、手ぶらでインタラクトしたときの俯瞰ビュー
 *   (DirectoryOverview)で、割り当てられた束にだけ色の縁が付く
 */
export function DirectoryObject({object}: {object: GameObject}) {
  const {stock, outputs} = useMemo(
    () => parseDirectoryData(object.data),
    [object.data],
  );
  const mountain = useMemo(() => buildMountain(object.id), [object.id]);
  const coreGeometry = useMemo(
    () => buildCoreGeometry(mountain.core),
    [mountain],
  );
  const overviewing = useIsOverviewing(object.id);

  return (
    <group userData={aoModeUserData("realtime")}>
      <BVHCollider>
        <mesh geometry={coreGeometry}>
          <meshStandardMaterial color={CORE_COLOR} flatShading />
        </mesh>
      </BVHCollider>
      <SheetStack sheets={mountain.sheets} count={mountain.sheets.length} />
      <LooseSheets sheets={mountain.looseSheets} />
      <SheetStack sheets={mountain.outputSheets} count={outputs} />
      {overviewing && (
        <DirectoryOverview
          directoryId={object.id}
          position={object.position}
          candidates={mountain.candidates}
          stock={stock}
        />
      )}
    </group>
  );
}

/**
 * 俯瞰しているディレクトリが消えたら(サーバーの remove)、補間を待たず一人称へ戻す。
 * ディレクトリ自身の側では、消えると一緒に外れてしまうので、常に置いてある ManagedObjects の側で見る
 */
export function useOverviewGuard(objects: readonly GameObject[]): void {
  const directoryId = useOverviewDirectoryId();
  useEffect(() => {
    if (directoryId !== null && !objects.some((o) => o.id === directoryId)) {
      overview.reset();
    }
  }, [directoryId, objects]);
}
