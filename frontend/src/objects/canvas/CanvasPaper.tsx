import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {BoxGeometry} from "three";

import {denoiseProgress, stepAppear, stepFade} from "./diffusion";
import {createDiffusionPaper} from "./diffusionMaterial";
import {PAPER_PLACEMENT} from "./easel";

/**
 * キャンバスの紙(絵を描く面)。作業中(active)の間、拡散モデルがノイズから絵を起こしていく演出を描く(diffusionMaterial)。
 * 作業が始まると、白い紙がマスごとにノイズへ置き換わり、段ごとにノイズが薄れて絵が現れる。
 * 作業が終わる(結果が反映される)と、描き上がった絵が、上から順にすっと白い紙へ消えていく。時間の割り振りは diffusion.ts。
 * 描く絵とノイズは、作業ごとに変える。
 *
 * - 演出はマテリアルの色だけで出すので、板は増えない
 * - ベイク対象(baked)なので、CanvasObject の BakeTarget の配下に、常に置く(後から足した mesh はベイク対象にならない)
 * - ジオメトリ・マテリアルはキャンバスごとに持つ(uv1・aoMap と、演出の進み具合が、それぞれに付くため)
 */
export function CanvasPaper({active = false}: {active?: boolean}) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const paper = useMemo(createDiffusionPaper, []);
  useEffect(() => () => paper.material.dispose(), [paper]);
  const state = useRef({wasActive: false, elapsed: 0});

  useFrame((_, dt) => {
    const s = state.current;
    if (active && !s.wasActive) {
      s.elapsed = 0;
      paper.appear.value = 0;
      paper.seed.value = Math.floor(Math.random() * 65536);
    }
    s.wasActive = active;
    if (active) {
      s.elapsed += dt;
      paper.progress.value = denoiseProgress(s.elapsed);
    }
    paper.appear.value = stepAppear(paper.appear.value, active, dt);
    paper.fade.value = stepFade(paper.fade.value, active, dt);
  });

  return (
    <mesh
      geometry={geometry}
      material={paper.material}
      position={PAPER_PLACEMENT.position}
      scale={PAPER_PLACEMENT.scale}
      {...(PAPER_PLACEMENT.rotation && {rotation: PAPER_PLACEMENT.rotation})}
    />
  );
}
