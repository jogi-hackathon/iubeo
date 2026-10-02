import {useThree} from "@react-three/fiber";
import {useEffect} from "react";

import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../../camera/postprocess/settings";
import {getSkybox, SKY_HORIZON} from "./skybox";

/**
 * IUBEO の白い世界の共通環境(背景・フォグ・ライト)。ジオメトリは含まない。
 * 影は描かず、立体感は AO で出す。AO は間接光(半球光)だけを減衰させるので、半球光を主にして平行光は弱く足す。
 * 空は地平線(白)から天頂へのグラデーションと、見上げた先のブロックノイズ(skybox.ts)
 */
export function WhiteWorld() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const skybox = getSkybox();
    skybox.apply(getPostProcessSettings());
    const unsubscribe = subscribePostProcessSettings(() =>
      skybox.apply(getPostProcessSettings()),
    );
    scene.backgroundNode = skybox.node;
    return () => {
      unsubscribe();
      scene.backgroundNode = null;
    };
  }, [scene]);

  return (
    <>
      <fog attach="fog" args={[SKY_HORIZON, 15, 90]} />
      <hemisphereLight args={["#ffffff", "#d8d8d8", 2.2]} />
      <directionalLight position={[8, 20, 6]} intensity={0.7} />
    </>
  );
}
