/**
 * キーボードのキーキャップの配置。実物の寸法に寄せる（1u = 19mm）。
 * 段は、数字段 + QWERTY 3 段 + スペース段の 5 段。右にテンキーを置く。
 *
 * 描画（PcModel の KeyCaps）から切り出してあるのは、机の上のどの位置に何個並ぶかを
 * 単体で確かめられるようにするため。
 */

export const KEY_ROWS = 5;
export const KEY_COLS = 15;
export const KEY_PITCH = 0.019;
export const NUMPAD_ROWS = 5;
export const NUMPAD_COLS = 4;
/** 本体のブロックとテンキーの間 */
export const NUMPAD_GAP = 0.022;
/** キーキャップの一辺（ピッチに対する比率。隙間を空けて、粒が読めるようにする） */
export const KEY_SIZE_RATIO = 0.82;

/** キーキャップの総数（インスタンス描画の数） */
export const KEY_COUNT = KEY_ROWS * KEY_COLS + NUMPAD_ROWS * NUMPAD_COLS;

/** キーキャップ 1 つの一辺(m) */
export const keySize = (): number => KEY_PITCH * KEY_SIZE_RATIO;

/** キーボード全体の幅(m)。台（KEYBOARD.width）に収まるかの確認に使う */
export const keyboardKeysWidth = (): number => {
  const key = keySize();
  const main = (KEY_COLS - 1) * KEY_PITCH + key;
  const pad = (NUMPAD_COLS - 1) * KEY_PITCH + key;
  return main + NUMPAD_GAP + pad;
};

/**
 * キーキャップの中心（x, z）を、机の上の座標で返す。前端は台の手前の縁に合わせ、
 * 左右は全体が台の中央に来るようにする
 */
export const keyPositions = (
  originZ: number,
  depth: number,
): Array<[number, number]> => {
  const key = keySize();
  const mainWidth = (KEY_COLS - 1) * KEY_PITCH + key;
  const blockDepth = (KEY_ROWS - 1) * KEY_PITCH + key;
  const left = -keyboardKeysWidth() / 2;
  const front = originZ - depth / 2 + (depth - blockDepth) / 2 + key / 2;

  const positions: Array<[number, number]> = [];
  const push = (x0: number, rows: number, cols: number) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        positions.push([x0 + col * KEY_PITCH, front + row * KEY_PITCH]);
      }
    }
  };
  push(left, KEY_ROWS, KEY_COLS);
  push(left + mainWidth + NUMPAD_GAP, NUMPAD_ROWS, NUMPAD_COLS);
  return positions;
};
