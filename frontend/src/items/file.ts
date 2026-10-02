import type {JsonValue} from "../core/json";

/** アイテムの kind。ファイルを持っているかは、これで見分ける */
export const FILE_KIND = "file";

/**
 * ファイルの状態(1 つの値)。
 * - unedited: ディレクトリから取り出した、編集前のファイル
 * - edited: 取り出して編集した後のファイル
 * - file_created / search_created / image_created: 新しく作ったファイル(作成したファイルは編集しない)。
 *   file_created はワークスペースで作る物。search_created / image_created は、将来別のオブジェクトで作る物
 */
export type FileStatus =
  | "unedited"
  | "edited"
  | "file_created"
  | "search_created"
  | "image_created";

/** 新しく作ったファイルの状態 */
export type CreatedStatus = Extract<
  FileStatus,
  "file_created" | "search_created" | "image_created"
>;

const STATUSES: readonly FileStatus[] = [
  "unedited",
  "edited",
  "file_created",
  "search_created",
  "image_created",
];

/** 新しく作ったファイルの状態か(作成系なら、ディレクトリに入れると成果物になる) */
export const isCreatedStatus = (status: FileStatus): status is CreatedStatus =>
  status === "file_created" ||
  status === "search_created" ||
  status === "image_created";

/**
 * ファイルの data。ファイルの識別は、アイテムの id が担う(id は不透明な文字列で、状態を混ぜない)。
 * ファイル自体に色は付けず、color はアウトラインの色(ディレクトリから取り出したファイルだけ持つ)
 */
export type FileData = {
  status: FileStatus;
  color?: string;
};

/** data が FileData として読めれば返す。status が不正など、読めなければ null */
export const parseFileData = (data: JsonValue): FileData | null => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const {status, color} = data;
  if (typeof status !== "string" || !STATUSES.includes(status as FileStatus)) {
    return null;
  }
  return {
    status: status as FileStatus,
    ...(typeof color === "string" && {color}),
  };
};
