// 計測専用のシーン(製品にも開発シーンにも入らない)。TestScene の地形の上に、歩く・跳ねるキャラクターを N 体置く。
// N は URL の n= で決まる(?scene=crowd&n=30)。キャラクターあたりの描画・更新コストを測るため。
import {useFrame} from "@react-three/fiber";
import {useMemo} from "react";

import {FRAME_PRIORITY} from "../../frontend/src/core/frameOrder";
import {createPlayerState, PlayerSkeleton, type PlayerState} from "../../frontend/src/player";
import {TestLayout} from "../../frontend/src/scenes/TestScene/TestLayout";
import {Ball, TiledFloor, Wall} from "../../frontend/src/props";
import {WhiteWorld} from "../../frontend/src/scenes/environment/WhiteWorld";

/** layout=... で地形の一部だけを描く(どの物がコストか切り分ける用)。未指定なら TestLayout 全体 */
const LAYOUT = new URLSearchParams(location.search).get("layout") ?? "all";
const Layout = () => {
  if (LAYOUT === "all") return <TestLayout />;
  return (
    <>
      <WhiteWorld />
      <TiledFloor />
      {(LAYOUT === "walls" || LAYOUT === "props") && (
        <>
          <Wall position={[0, 1.5, -12]} size={[16, 3, 0.5]} />
          <Wall position={[8, 1.5, -8]} size={[0.5, 3, 8]} />
          <Wall position={[-8, 0.75, -8]} size={[0.5, 1.5, 8]} />
          <Wall position={[-3, 0.25, -5]} size={[2, 0.5, 2]} />
          <Wall position={[-3, 0.5, -7]} size={[2, 1, 2]} />
        </>
      )}
      {(LAYOUT === "balls" || LAYOUT === "props") && (
        <>
          <Ball position={[3, 2, -8]} radius={2} />
          <Ball position={[-4, 0.5, -10]} radius={0.5} />
          <Ball position={[0, 1, -6]} radius={1} />
        </>
      )}
    </>
  );
};

const N = Math.max(0, Number(new URLSearchParams(location.search).get("n") ?? 10));
/** idle=1 なら全員その場で待機(歩かない)。待機中の更新コストを比べるため */
const IDLE = new URLSearchParams(location.search).get("idle") === "1";

/** 円周を歩く。半径と速さをキャラクターごとに変えて、同じ動きが揃わないようにする */
const walk = (i: number) => {
  const radius = 2 + (i % 7) * 0.9;
  const cx = ((i % 9) - 4) * 2.2;
  const cz = -4 - Math.floor(i / 9) * 2.2;
  const speed = IDLE ? 0 : 1.2 + (i % 5) * 0.25;
  const phase = i * 0.37;
  return (t: number, s: PlayerState) => {
    const w = speed / radius;
    if (IDLE) {
      s.position.set(cx + radius, 0, cz);
      s.velocity.set(0, 0, 0);
      s.onGround = true;
      s.yaw = Math.PI;
      return;
    }
    const a = w * t + phase;
    s.position.set(cx + radius * Math.cos(a), 0, cz + radius * Math.sin(a));
    s.velocity.set(-speed * Math.sin(a), 0, speed * Math.cos(a));
    s.onGround = true;
    s.yaw = Math.atan2(-s.velocity.x, -s.velocity.z);
  };
};

function Character({index}: {index: number}) {
  const script = useMemo(() => walk(index), [index]);
  const state = useMemo(() => {
    const s = createPlayerState(0, 0, 0);
    script(0, s);
    return s;
  }, [script]);
  useFrame(({clock}) => script(clock.elapsedTime, state), FRAME_PRIORITY.player);
  return <PlayerSkeleton state={state} holding={index % 3 === 0} />;
}

export function CrowdScene() {
  return (
    <>
      <Layout />
      {Array.from({length: N}, (_, i) => (
        <Character key={i} index={i} />
      ))}
    </>
  );
}
