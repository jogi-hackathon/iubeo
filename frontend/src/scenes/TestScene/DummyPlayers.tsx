import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useState} from "react";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {
  createPlayerState,
  PlayerSkeleton,
  type PlayerState,
} from "../../player";
import {GRAVITY, JUMP_SPEED} from "../../player/constants";

/** t 秒時点の状態を s に書く(物理は使わず、決まった動きをなぞるだけ) */
type Script = (t: number, s: PlayerState) => void;

/** 円周上を歩く。向きは進行方向 */
const walkCircle =
  (cx: number, cz: number, radius: number, speed: number): Script =>
  (t, s) => {
    const w = speed / radius;
    const a = w * t;
    s.position.set(cx + radius * Math.cos(a), 0, cz + radius * Math.sin(a));
    s.velocity.set(-speed * Math.sin(a), 0, speed * Math.cos(a));
    s.onGround = true;
    s.yaw = Math.atan2(-s.velocity.x, -s.velocity.z);
  };

const JUMP_AIR_TIME = (2 * JUMP_SPEED) / GRAVITY;

/** その場で周期的にジャンプする。yaw は原点(スポーン地点)側を向く */
const jumpInPlace =
  (x: number, z: number, period: number): Script =>
  (t, s) => {
    const tau = t % period;
    const air = tau < JUMP_AIR_TIME;
    s.position.set(
      x,
      air ? JUMP_SPEED * tau - 0.5 * GRAVITY * tau * tau : 0,
      z,
    );
    s.velocity.set(0, air ? JUMP_SPEED - GRAVITY * tau : 0, 0);
    s.onGround = !air;
    s.yaw = Math.PI;
  };

/** 立ち止まって原点側を向く */
const stand =
  (x: number, z: number): Script =>
  (_, s) => {
    s.position.set(x, 0, z);
    s.velocity.set(0, 0, 0);
    s.onGround = true;
    s.yaw = Math.PI;
  };

interface DummyPlayerProps {
  script: Script;
  /** true/false で固定。数値なら、その秒数ごとに持つ/持たないを切り替える */
  holding: boolean | number;
}

function DummyPlayer({script, holding}: DummyPlayerProps) {
  const state = useMemo(() => {
    const s = createPlayerState(0, 0, 0);
    script(0, s);
    return s;
  }, [script]);
  const [held, setHeld] = useState(holding === true);

  useEffect(() => {
    if (typeof holding !== "number") {
      setHeld(holding);
      return;
    }
    const id = setInterval(() => setHeld((h) => !h), holding * 1000);
    return () => clearInterval(id);
  }, [holding]);

  useFrame(
    ({clock}) => script(clock.elapsedTime, state),
    FRAME_PRIORITY.player,
  );

  return <PlayerSkeleton state={state} holding={held} />;
}

const WALKER = walkCircle(4, -3, 1.5, 2.4);
const JUMPER = jumpInPlace(0, -3, 1.6);
const HOLDER = stand(-3, -3);

/**
 * 見た目確認用のダミープレイヤー(歩行+ホールド切替 / ジャンプ / 待機+ホールド)。
 * プレイヤー管理ができたら、そのレジストリから PlayerSkeleton を並べる形に置き換える
 */
export function DummyPlayers() {
  return (
    <>
      <DummyPlayer script={WALKER} holding={4} />
      <DummyPlayer script={JUMPER} holding={false} />
      <DummyPlayer script={HOLDER} holding />
    </>
  );
}
