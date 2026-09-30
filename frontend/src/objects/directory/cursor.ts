import {Quaternion, Vector3} from "three";

/** 画面上の仮想カーソルの位置。NDC(左下 -1,-1 〜 右上 1,1) */
export type Cursor = {x: number; y: number};

/** 俯瞰に入ったとき、カーソルは画面中央から始める */
export const CENTER_CURSOR: Readonly<Cursor> = {x: 0, y: 0};

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * マウスの移動量(px)でカーソルを動かす。実際のマウスカーソルに近い感覚にするため、移動量は
 * 画面のピクセル数で NDC に直す(1px の移動が 1px の移動になる)。画面の外には出ない。
 * 右(dx>0)で右、下(dy>0)で下(NDC の y は上が正なので符号が逆になる)
 */
export const moveCursor = (
  cursor: Cursor,
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): Cursor => {
  cursor.x = clamp(cursor.x + (dx / viewport.width) * 2);
  cursor.y = clamp(cursor.y - (dy / viewport.height) * 2);
  return cursor;
};

const _local = new Vector3();

/**
 * カーソルの位置を通る視線(カメラの位置から world 方向への単位ベクトル)。
 * raycaster.setFromCamera と同じ考え方を、カメラの姿勢(位置・向き・画角)だけから計算する純粋関数。
 * fov は縦の画角(度)、aspect は 幅/高さ
 */
export const cursorRay = (
  cursor: Cursor,
  position: Vector3,
  quaternion: Quaternion,
  fovDegrees: number,
  aspect: number,
): {origin: Vector3; direction: Vector3} => {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  _local.set(cursor.x * half * aspect, cursor.y * half, -1);
  return {
    origin: position.clone(),
    direction: _local.clone().applyQuaternion(quaternion).normalize(),
  };
};
