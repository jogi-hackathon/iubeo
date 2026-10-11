import type {JsonValue} from "../core/json";

export const FILE_KIND = "file";

export type FileStatus =
  | "unedited"
  | "edited"
  | "file_created"
  | "search_created"
  | "image_created";

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

export const isCreatedStatus = (status: FileStatus): status is CreatedStatus =>
  status === "file_created" ||
  status === "search_created" ||
  status === "image_created";

export type FileData = {
  status: FileStatus;
  color?: string;
};

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
