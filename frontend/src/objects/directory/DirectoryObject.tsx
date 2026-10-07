import {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {BoxGeometry, Color, type InstancedMesh, Object3D} from "three";

import {BakeTarget} from "../../bake/BakeTarget";
import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {BVHCollider} from "../../core/bvh";
import {useIsVisible} from "../../core/toggles";
import type {GameObject} from "../types";
import {parseDirectoryData} from "./data";
import {DirectoryOverview} from "./DirectoryOverview";
import {buildCoreGeometry, buildSheetsGeometry} from "./geometry";
import {buildMountain, type Sheet} from "./mountain";
import {overview, useIsOverviewing, useOverviewDirectoryId} from "./overview";
import {createPaperMaterial, setSheetInfo} from "./paperMaterial";

/** 芯の色。板より一段暗い紙色にして、散りばめた板が見分けられるようにする */
const CORE_COLOR = "#e4e4e1";

const dummy = new Object3D();
const color = new Color();

type StackProps = {
  sheets: readonly Sheet[];
  /** 見せる数(先頭から) */
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
  // 縞の間隔や表紙の厚みがワールド単位で一定になるよう、インスタンスごとの大きさを属性で渡す
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
    // 境界球は、フラスタムカリングと狙いの判定(raycast)が使う。作った時点の数で固定されるので、数が変わるたびに作り直す
    mesh.computeBoundingSphere();
  }, [sheets, count]);

  return <instancedMesh ref={ref} args={[geometry, material, sheets.length]} />;
}

/**
 * ディレクトリ: 書類の束を段々(テラス)に積んだ山(手続き生成)。上へ行くほど狭くなる段の外周の帯に、束(薄い板の小さな山積み)を
 * ずらし・回して並べる。IUBEO は白い世界なので、束は紙の白で、側面には紙の層の細い縞を描く。
 *   段の縁や束から、薄い紙がはみ出す(差し色は、このはみ出し紙のごく少数だけ)。
 *
 * - AO はベイクだけ(baked。GTAO は掛けない)。ディレクトリは動かず、形は id から決まるので、シーンと一緒に焼ける
 *   (`pnpm bake:ao`。ベイクページも同じ id・位置でディレクトリを置く)。id・位置・山の形を変えたら再ベイクが要る。
 *   ベイク結果と合わない間は、シーン全体のベイク AO が外れる(BakedAO)
 *   AO の出し方は、置かれたシーンが決める(既定は baked。room のように出し入れするシーンは、影が残らないよう ManagedObjects の ao で realtime にする)
 * - 束の本とはみ出す紙は、1 つにまとめた通常の mesh(1 回の描画)。コライダーにはせず、ベイク対象としてだけ登録する(BakeTarget)
 * - コライダーは、段々の芯。束は芯に載っているので、プレイヤーは芯に当たる(束のはみ出しは、コライダーの外)
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
  useEffect(() => () => coreGeometry.dispose(), [coreGeometry]);
  const sheetsGeometry = useMemo(
    () => buildSheetsGeometry(mountain.sheets, mountain.looseSheets),
    [mountain],
  );
  useEffect(() => () => sheetsGeometry.dispose(), [sheetsGeometry]);
  const paperMaterial = useMemo(() => createPaperMaterial({merged: true}), []);
  useEffect(() => () => paperMaterial.dispose(), [paperMaterial]);
  const overviewing = useIsOverviewing(object.id);
  // 非表示の間は、見た目(ObjectRoot が消す)だけでなく、山にぶつからないようにコライダーも無効にする
  const visible = useIsVisible(object.kind);

  return (
    <group>
      <BVHCollider enabled={visible}>
        <mesh geometry={coreGeometry}>
          <meshStandardMaterial color={CORE_COLOR} flatShading />
        </mesh>
      </BVHCollider>
      <BakeTarget>
        <mesh geometry={sheetsGeometry} material={paperMaterial} />
      </BakeTarget>
      <OutputSheets sheets={mountain.outputSheets} count={outputs} />
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
