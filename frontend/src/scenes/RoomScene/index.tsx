import {TiledFloor} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";

/** 立方体の空洞の1人用部屋(チュートリアル+ニュートラル時に入室)。今は床だけ。中身は #13 で実装する */
export function RoomScene() {
  return (
    <>
      <WhiteWorld />
      <TiledFloor />
    </>
  );
}
