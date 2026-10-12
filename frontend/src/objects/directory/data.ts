import type {JsonValue} from "../../core/json";

export const DIRECTORY_KIND = "directory";

export const DIRECTORY_FEATURES = ["overview"] as const;

export type StockFile = {
  id: string;
  color: string;
  status: "unedited" | "edited";
};

export type DirectoryData = {
  stock: StockFile[];
  outputs: number;
};

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
