import {TiledFloor} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";

/** 正三角錐柱の3人用部屋(セッション開始時に入室)。今は床だけ。中身は #14 で実装する */
export function SandboxScene() {
  return (
    <>
      <WhiteWorld />
      <TiledFloor />
    </>
  );
}
