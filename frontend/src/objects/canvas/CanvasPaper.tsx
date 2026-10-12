import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {MeshStandardMaterial, PlaneGeometry} from "three";

import {UNDER_SHEET_COLOR} from "../paperSheet";
import {denoiseProgress, stepAppear, stepFade} from "./diffusion";
import {createDiffusionPaper} from "./diffusionMaterial";
import {PAPER_PLACEMENT, placementProps, UNDER_SHEET_PLACEMENT} from "./easel";

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
