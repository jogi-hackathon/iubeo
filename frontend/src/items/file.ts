import type {JsonValue} from "../core/json";

/** アイテムの kind。ファイルを持っているかは、これで見分ける */
export const FILE_KIND = "file";

/** stock は、ディレクトリの在庫(Read + Edit の取り出し元)から取ったもの。他は、新しく作ったもの */
export type FileOrigin = "stock" | "write" | "web_search" | "image_generation";

const ORIGINS: readonly FileOrigin[] = [
  "stock",
  "write",
  "web_search",
  "image_generation",
];

/**
 * ファイルの data。取り出し元のファイルの識別は、アイテムの id が担う(stock のファイル id をそのまま使う)。
 * ファイル自体に色は付けず、color はアウトラインの色(取り出し元のファイルだけ持つ)
 */
export type FileData = {
  origin: FileOrigin;
  color?: string;
  edited: boolean;
};

/** data が FileData として読めれば返す。origin が不正など、読めなければ null */
export const parseFileData = (data: JsonValue): FileData | null => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const {origin, color, edited} = data;
  if (typeof origin !== "string" || !ORIGINS.includes(origin as FileOrigin)) {
    return null;
  }
  return {
    origin: origin as FileOrigin,
    ...(typeof color === "string" && {color}),
    edited: edited === true,
  };
};
