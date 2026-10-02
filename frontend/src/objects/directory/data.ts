import type {JsonValue} from "../../core/json";

export const DIRECTORY_KIND = "directory";

/** 在庫の 1 ファイル。ファイル自体に色は付けず、color はアウトラインの色。status は編集前か編集済みか */
export type StockFile = {
  id: string;
  color: string;
  status: "unedited" | "edited";
};

/**
 * ディレクトリの data。stock は「今ディレクトリの中にある」取り出し元のファイルだけ
 * (誰かが借りている間は含まれない)。outputs は成果物(新しく作ったファイル)の数
 */
export type DirectoryData = {stock: StockFile[]; outputs: number};

const parseStockFile = (value: JsonValue): StockFile | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const {id, color, status} = value;
  if (
    typeof id !== "string" ||
    typeof color !== "string" ||
    (status !== "unedited" && status !== "edited")
  ) {
    return null;
  }
  return {id, color, status};
};

/**
 * data を DirectoryData として読む。サーバーの値は信用しきらず、読めない部分は捨てて
 * (壊れたファイルは飛ばし、outputs は 0 以上の整数に丸める)、何が来ても描画を止めない
 */
export const parseDirectoryData = (data: JsonValue): DirectoryData => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {stock: [], outputs: 0};
  }
  const {stock, outputs} = data;
  return {
    stock: Array.isArray(stock)
      ? stock.flatMap((s) => parseStockFile(s) ?? [])
      : [],
    outputs:
      typeof outputs === "number" && Number.isFinite(outputs)
        ? Math.max(0, Math.floor(outputs))
        : 0,
  };
};
