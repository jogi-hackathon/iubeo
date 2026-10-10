import type {JsonValue} from "../core/json";
import {parseDirectoryData} from "../objects/directory/data";

/** 共有のディレクトリの id(state-schema §6 の約束) */
export const DIRECTORY_ID = "directory-1";

/** 在庫の色を引くのに要る分だけ(オブジェクト全体は要らない) */
export type StockColorSource = {id: string; data: JsonValue};

/**
 * 今ディレクトリの在庫にあるファイルの id → 色。読み込みと編集のタスクで、対象のファイルを
 * 山の紙の色から見分けるために使う(誰かが持っている間は在庫に無いので、色は分からない)
 */
export const stockColorsOf = (
  objects: readonly StockColorSource[],
): Map<string, string> => {
  const colors = new Map<string, string>();
  const directory = objects.find((object) => object.id === DIRECTORY_ID);
  if (!directory) {
    return colors;
  }
  for (const file of parseDirectoryData(directory.data).stock) {
    colors.set(file.id, file.color);
  }
  return colors;
};
