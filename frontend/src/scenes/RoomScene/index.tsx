import {useState} from "react";

import {LocalAuthority} from "../../authority/local/LocalAuthority";
import {createToggleStore, useIsVisible} from "../../core/toggles";
import {TogglesProvider} from "../../core/TogglesProvider";
import {ManagedObjects} from "../../objects";
import {featureKey} from "../../objects/layout";
import {Chair, Wall} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";
import {ROOM_INITIAL} from "./initial";
import {CHAIR_POSITION, ROOM_FLOOR, ROOM_LAYOUT, ROOM_WALLS} from "./layout";
import {MatchmakingButton} from "./MatchmakingButton";
import {CHAIR_KEY, WINDOW_KEY} from "./props";
import {WindowPlug} from "./WindowPlug";

function RoomProps() {
  const chairVisible = useIsVisible(CHAIR_KEY);
  const windowVisible = useIsVisible(WINDOW_KEY);
  return (
    <>
      <WhiteWorld />
      <Wall position={ROOM_FLOOR.position} size={ROOM_FLOOR.size} />
      {ROOM_WALLS.map((wall, i) => (
        <Wall key={i} position={wall.position} size={wall.size} />
      ))}
      <WindowPlug visible={!windowVisible} />
      <Chair position={CHAIR_POSITION} visible={chairVisible} ao="realtime" />
      <MatchmakingButton />
    </>
  );
}

/**
 * 立方体の空洞の1人用部屋(チュートリアル+ニュートラル時に入室)。
 * 床・壁・天井・イスはここで置く(共通の床は使わず、部屋専用の床を敷く)。ディレクトリ・ワークスペース・キャンバス・PC は ManagedObjects が描く(置き場所は ./layout)。
 * イス・窓・オブジェクトは、core/toggles で個別に表示・非表示と機能の ON・OFF を切り替えられる(キーは ./props)。
 * トグルのストアはこのシーンが持つ(マウントで作り、TogglesProvider で配下に配る)。シーンを出れば捨てられるので、再入室すれば初期状態に戻る。
 * 物(ディレクトリ・ワークスペース・キャンバス・PC)は LocalAuthority が置く(何を置くかは ./initial と ./layout)。
 * 初期状態は、ディレクトリの俯瞰ビューだけ機能 OFF(チュートリアルが後から ON にする。ファイルを持っているときの「入れる」は、これと関係なく動く)、他は全部表示・全部機能 ON。
 * Canvas の外からは getActiveToggles / useActiveToggles で参照できる。
 * 出し入れするイスとオブジェクトは、ベイクすると隠したあとも影が壁・床に残るので、AO は realtime にしてベイクしない(壁・床・天井だけをベイクする)。
 * 左の壁の窓は、専用のジオメトリができるまで何もはめない空洞(非表示にすると壁板でふさぐ)
 */
export function RoomScene() {
  const [toggles] = useState(() =>
    createToggleStore({disabled: [featureKey("directory", "overview")]}),
  );
  return (
    <TogglesProvider store={toggles}>
      <RoomProps />
      <LocalAuthority
        scene="room"
        layout={ROOM_LAYOUT}
        initial={ROOM_INITIAL}
      />
      <ManagedObjects layout={ROOM_LAYOUT} ao="realtime" />
    </TogglesProvider>
  );
}
