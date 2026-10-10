import {aoModeUserData} from "../bake/aoMode";
import type {GameObject} from "./types";

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

/** レイアウトの項目はあるが、種類のコンポーネントが無い物を描く箱(ManagedObjects の既定) */
export function DummyObject({object}: {object: GameObject}) {
  return (
    <mesh userData={aoModeUserData("realtime")}>
      <boxGeometry args={[DUMMY_SIZE, DUMMY_SIZE, DUMMY_SIZE]} />
      <meshStandardMaterial color={colorOf(object)} />
    </mesh>
  );
}
