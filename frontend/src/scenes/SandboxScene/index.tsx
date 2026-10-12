import {useEffect, useRef, useState} from "react";
import type {
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
} from "three/webgpu";

import {ServerAuthority} from "../../authority/server/ServerAuthority";
import {gameFlow} from "../../flow/store";
import {SpectateOnElimination} from "../../game/SpectateOnElimination";
import {ManagedObjects} from "../../objects";
import {RemotePlayers} from "../../player";
import {Chair, Slab, useGridFloorMaterial, Wall} from "../../props";
import {VoiceChat} from "../../voice";
import {WhiteWorld} from "../environment/WhiteWorld";
import {WindowAmbience} from "../environment/WindowAmbience";
import {
  FrostedPartition,
  useFrostedPartitionMaterial,
} from "./FrostedPartition";
import {
  ZONE_CHAIR,
  SANDBOX_LAYOUT,
  ZONE_COUNT,
  ZONE_FLOOR,
  ZONE_FLOOR_TILE,
  ZONE_ROOF,
  ZONE_WALLS,
  ZONE_WINDOW_BLOCKER,
  sandboxSpawnOf,
  seatYaw,
} from "./layout";

const ZONES = Array.from({length: ZONE_COUNT}, (_, i) => i);

function SandboxZone({
  index,
  floorMaterial,
  partitionMaterial,
}: {
  index: number;
  floorMaterial: MeshStandardNodeMaterial;
  partitionMaterial: MeshBasicNodeMaterial;
}) {
  return (
    <group rotation={[0, seatYaw(index + 1), 0]}>
      <Slab {...ZONE_FLOOR} material={floorMaterial} blocksCamera />
      {ZONE_WALLS.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} blocksCamera />
      ))}
      <Wall
        position={ZONE_WINDOW_BLOCKER.position}
        size={ZONE_WINDOW_BLOCKER.size}
        visible={false}
        ao="realtime"
        blocksCamera
      />
      <FrostedPartition material={partitionMaterial} />
      <Slab {...ZONE_ROOF} blocksCamera />
      <Chair position={ZONE_CHAIR.position} yaw={ZONE_CHAIR.yaw} />
      <WindowAmbience position={ZONE_WINDOW_BLOCKER.position} />
    </group>
  );
}

export function SandboxScene() {
  const [session] = useState(() => gameFlow.currentSession());
  useLeaveSessionOnUnmount();
  return (
    <>
      <SandboxStructure />
      {session && (
        <>
          <ServerAuthority
            scene="sandbox"
            sessionId={session.sessionId}
            playerId={session.playerId}
            spawnOf={sandboxSpawnOf}
            onReady={gameFlow.sessionReady}
            onFinished={gameFlow.sessionFinished}
            onClosed={gameFlow.sessionClosed}
          />
          <ManagedObjects layout={SANDBOX_LAYOUT} ao="realtime" />
          <RemotePlayers />
          <VoiceChat
            sessionId={session.sessionId}
            playerId={session.playerId}
          />
          <SpectateOnElimination />
        </>
      )}
    </>
  );
}

/**
 * StrictMode の開発時は、マウント直後に effect の後始末がいったん走って、また設定が走る。
 * その間に知らせると流れが idle に戻ってしまうので、後始末では 1 tick 待って、設定が走り直したら取り消す
 */
const useLeaveSessionOnUnmount = () => {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pending.current !== null) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    return () => {
      pending.current = setTimeout(() => {
        pending.current = null;
        gameFlow.leftSession();
      }, 0);
    };
  }, []);
};

export function SandboxStructure() {
  const floorMaterial = useGridFloorMaterial(ZONE_FLOOR_TILE);
  const partitionMaterial = useFrostedPartitionMaterial();
  return (
    <>
      <WhiteWorld />
      {ZONES.map((zone) => (
        <SandboxZone
          key={zone}
          index={zone}
          floorMaterial={floorMaterial}
          partitionMaterial={partitionMaterial}
        />
      ))}
    </>
  );
}
