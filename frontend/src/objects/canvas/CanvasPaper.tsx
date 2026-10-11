import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {MeshStandardMaterial, PlaneGeometry} from "three";

import {UNDER_SHEET_COLOR} from "../paperSheet";
import {denoiseProgress, stepAppear, stepFade} from "./diffusion";
import {createDiffusionPaper} from "./diffusionMaterial";
import {PAPER_PLACEMENT, placementProps, UNDER_SHEET_PLACEMENT} from "./easel";

/**
 * キャンバスの紙(絵を描く面)。木枠の前面に沿わせた 1 枚の板(ワークスペースの紙と同じ PlaneGeometry)で、
 * 作業中(active)の間、拡散モデルがノイズから絵を起こしていく演出を描く(diffusionMaterial)。それ以外は真っ白。
 * 作業が始まると、白い紙がマスごとにノイズへ置き換わり、段ごとにノイズが薄れて絵が現れる。
 * 作業が終わる(結果が反映される)と、描き上がった絵が、上から順にすっと白い紙へ消えていく。時間の割り振りは diffusion.ts。
 * 描く絵とノイズは、作業ごとに変える。
 * 紙の下には、少し灰色の下敷きを右下へずらして重ね、影の代わりにする(ワークスペースの紙と同じ 2 枚重ね。paperSheet)。
 *
 * - 演出は、active が false → true に変わったフレームから始める(時間はそこからの経過で、作業の本当の開始時刻ではない)。
 *   マウントした時点ですでに作業中なら(途中参加・途中で出し入れされた場合)、始まりを見ていないので演出を出さない
 *   (途中から始めると、描き上がる前に結果が反映されて消えてしまうため)。
 *   作業の終わりと次の作業の始まりが同じフレームに重なると始め直せないが、紙は 1 人ずつしか使えず、
 *   次の作業は結果が反映された後の新しいインタラクトからなので、起きない
 * - ベイク対象(baked)なので、CanvasObject の BakeTarget の配下に、常に置く(後から足した mesh はベイク対象にならない)
 * - ジオメトリ・マテリアルはキャンバスごとに持つ(uv1・aoMap と、演出の進み具合が、それぞれに付くため)
 */
export function CanvasPaper({active = false}: {active?: boolean}) {
  const [geometry, underGeometry] = useMemo(
    () => [new PlaneGeometry(1, 1), new PlaneGeometry(1, 1)],
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      underGeometry.dispose();
    },
    [geometry, underGeometry],
  );
  const underSheet = useMemo(
    () => new MeshStandardMaterial({color: UNDER_SHEET_COLOR}),
    [],
  );
  useEffect(() => () => underSheet.dispose(), [underSheet]);
  const paper = useMemo(createDiffusionPaper, []);
  useEffect(() => () => paper.material.dispose(), [paper]);
  const state = useRef({wasActive: active, playing: false, elapsed: 0});

  useFrame((_, dt) => {
    const s = state.current;
    if (active && !s.wasActive) {
      s.playing = true;
      s.elapsed = 0;
      paper.appear.value = 0;
      paper.reseed();
    }
    s.wasActive = active;
    const playing = active && s.playing;
    if (playing) {
      s.elapsed += dt;
      paper.progress.value = denoiseProgress(s.elapsed);
    }
    paper.appear.value = stepAppear(paper.appear.value, playing, dt);
    paper.fade.value = stepFade(paper.fade.value, playing, dt);
  });

  return (
    <>
      <mesh
        geometry={underGeometry}
        material={underSheet}
        {...placementProps(UNDER_SHEET_PLACEMENT)}
      />
      <mesh
        geometry={geometry}
        material={paper.material}
        {...placementProps(PAPER_PLACEMENT)}
      />
    </>
  );
}
