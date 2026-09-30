import {aoModeUserData} from "../bake/aoMode";
import type {GameObject} from "./types";
import {useObjectsState} from "./useObjects";

// テスト用のダミー描画。白い世界で見分けがつくよう、状態ごとに色を変える
const COLOR_IDLE = "#5b9bff";
const COLOR_IN_USE = "#ff9f43";
const COLOR_UNAVAILABLE = "#c8c8c8";
const DUMMY_SIZE = 0.6;

const colorOf = (o: GameObject): string => {
  if (o.availability === "unavailable") {
    return COLOR_UNAVAILABLE;
  }
  return o.users.length > 0 ? COLOR_IN_USE : COLOR_IDLE;
};

/**
 * objectManager のオブジェクトをシーンに描画する。kind ごとの見た目は、種類が決まってから足す。
 * 動的に増減するので、コライダーにはせずベイクAOの対象外(realtime)にする
 */
export function ManagedObjects() {
  const {objects} = useObjectsState();
  return (
    <>
      {objects.map((o) => (
        <mesh
          key={o.id}
          userData={aoModeUserData("realtime")}
          position={o.position}
        >
          <boxGeometry args={[DUMMY_SIZE, DUMMY_SIZE, DUMMY_SIZE]} />
          <meshStandardMaterial color={colorOf(o)} />
        </mesh>
      ))}
    </>
  );
}
