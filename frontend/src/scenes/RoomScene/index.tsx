import {useState} from "react";

import {createToggleStore, useIsVisible} from "../../core/toggles";
import {TogglesProvider} from "../../core/TogglesProvider";
import {ManagedObjects} from "../../objects";
import {Chair, Wall} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";
import {CHAIR_POSITION, ROOM_FLOOR, ROOM_WALLS} from "./layout";
import {CHAIR_KEY} from "./props";

/** イスと壁・床。トグル(TogglesProvider)の配下に置く */
function RoomProps() {
  const chairVisible = useIsVisible(CHAIR_KEY);
  return (
    <>
      <WhiteWorld />
      <Wall position={ROOM_FLOOR.position} size={ROOM_FLOOR.size} />
      {ROOM_WALLS.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} />
      ))}
      <Chair position={CHAIR_POSITION} visible={chairVisible} ao="realtime" />
    </>
  );
}

/**
 * 立方体の空洞の1人用部屋(チュートリアル+ニュートラル時に入室)。
 * 床・壁・天井・イスはここで置く(共通の床は使わず、部屋専用の床を敷く)。ディレクトリ・ワークスペース・キャンバス・PC は ManagedObjects が描く(置き場所は ./layout)。
 * イスとオブジェクトは、core/toggles で個別に表示・非表示と機能の ON・OFF を切り替えられる(キーは ./props)。
 * トグルのストアはこのシーンが持つ(マウントで作り、TogglesProvider で配下に配る)。シーンを出れば捨てられるので、再入室すれば全部表示・全部機能 ON から始まる。
 * Canvas の外からは getActiveToggles / useActiveToggles で参照できる。
 * 出し入れするイスとオブジェクトは、ベイクすると隠したあとも影が壁・床に残るので、AO は realtime にしてベイクしない(壁・床・天井だけをベイクする)。
 * 左の壁の窓は、専用のジオメトリができるまで何もはめない空洞
 */
export function RoomScene() {
  const [toggles] = useState(createToggleStore);
  return (
    <TogglesProvider store={toggles}>
      <RoomProps />
      <ManagedObjects ao="realtime" />
    </TogglesProvider>
  );
}
