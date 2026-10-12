import type {FileStatus} from "../file";
import {EDITED} from "./edited";
import {FILE_CREATED} from "./fileCreated";
import {IMAGE_CREATED} from "./imageCreated";
import type {FileModel} from "./parts";
import {SEARCH_CREATED} from "./searchCreated";
import {UNEDITED} from "./unedited";

export type {FileModel, FilePart, FilePartLook, FilePartShape} from "./parts";

export const FILE_MODELS: Readonly<Record<FileStatus, FileModel>> = {
  unedited: UNEDITED,
  edited: EDITED,
  file_created: FILE_CREATED,
  image_created: IMAGE_CREATED,
  search_created: SEARCH_CREATED,
};
