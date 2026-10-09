import type {LocalInitial} from "../../authority/local/plan";
import {SAMPLE_DIRECTORY_STOCK} from "../sampleStock";

/** room に最初に置く物の初期設定(項目名ごと。ROOM_LAYOUT の項目名と一致させる) */
export const ROOM_INITIAL: LocalInitial = {
  directory: {stock: SAMPLE_DIRECTORY_STOCK},
};
