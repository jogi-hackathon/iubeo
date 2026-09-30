import {Ball, TiledFloor, Wall} from "../../props";
import {WhiteWorld} from "../environment/WhiteWorld";

/** 衝突確認用のテストシーン。開始位置(0,0,0)から見て -Z 方向に配置 */
export function TestScene() {
  return (
    <>
      <WhiteWorld />
      <TiledFloor />
      <Wall position={[0, 1.5, -12]} size={[16, 3, 0.5]} />
      <Wall position={[8, 1.5, -8]} size={[0.5, 3, 8]} />
      <Wall position={[-8, 0.75, -8]} size={[0.5, 1.5, 8]} />
      <Wall position={[-3, 0.25, -5]} size={[2, 0.5, 2]} />
      <Wall position={[-3, 0.5, -7]} size={[2, 1, 2]} />
      <Ball position={[3, 2, -8]} radius={2} />
      <Ball position={[-4, 0.5, -10]} radius={0.5} />
      <Ball position={[0, 1, -6]} radius={1} />
    </>
  );
}
