import {useState} from "react";

import {LocalAuthority} from "../../authority/local/LocalAuthority";
import {createToggleStore, useIsVisible} from "../../core/toggles";
import {TogglesProvider} from "../../core/TogglesProvider";
import {ManagedObjects} from "../../objects";
import {Chair, useGridFloorMaterial, Wall} from "../../props";
import {tutorialStore} from "../../tutorial";
import {WhiteWorld} from "../environment/WhiteWorld";
import {ROOM_INITIAL} from "./initial";
import {
  CHAIR_POSITION,
  ROOM_FLOOR,
  ROOM_FLOOR_TILE,
  ROOM_LAYOUT,
  ROOM_WALLS,
  WINDOW_PLUG,
} from "./layout";
import {CHAIR_KEY, WINDOW_KEY} from "./props";
import {COMPLETED_LOOK, HIDDEN_LOOK, toggleInitialFor} from "./tutorial/look";
import {TutorialDirector} from "./tutorial/TutorialDirector";
import {WindowPlug} from "./WindowPlug";

// 出し入れするイスとオブジェクトは、ベイクすると隠したあとも影が壁・床に残るので realtime にする
function RoomProps() {
  const chairVisible = useIsVisible(CHAIR_KEY);
  const windowVisible = useIsVisible(WINDOW_KEY);
  const floorMaterial = useGridFloorMaterial(ROOM_FLOOR_TILE);
  return (
    <>
      <WhiteWorld />
      <Wall
        position={ROOM_FLOOR.position}
        size={ROOM_FLOOR.size}
        material={floorMaterial}
      />
      {ROOM_WALLS.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} />
      ))}
      <WindowPlug visible={!windowVisible} />
      {/* 窓の空洞から飛び出して落ちないよう、当たり判定だけの壁でふさぐ */}
      <Wall
        position={WINDOW_PLUG.position}
        size={WINDOW_PLUG.size}
        visible={false}
        ao="realtime"
      />
      <Chair
        position={CHAIR_POSITION}
        visible={chairVisible}
        collidable={false}
        ao="realtime"
      />
    </>
  );
}

export function RoomScene() {
  const [toggles] = useState(() =>
    createToggleStore(
      toggleInitialFor(
        tutorialStore.getState().completed ? COMPLETED_LOOK : HIDDEN_LOOK,
      ),
    ),
  );
  return (
    <TogglesProvider store={toggles}>
      <RoomProps />
      <TutorialDirector />
      <LocalAuthority
        scene="room"
        layout={ROOM_LAYOUT}
        initial={ROOM_INITIAL}
      />
      <ManagedObjects layout={ROOM_LAYOUT} ao="realtime" />
    </TogglesProvider>
  );
}
