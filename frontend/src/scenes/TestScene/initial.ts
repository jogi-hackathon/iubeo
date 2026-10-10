import type {LocalInitial} from "../../authority/local/plan";
import {SAMPLE_DIRECTORY_STOCK} from "../sampleStock";

/**
 * test に最初に置く物の初期設定(項目名ごと)。ダミーの箱は、ここに書いた項目だけ置く
 * (dummy-1〜3。予備の dummy-4〜8 は書かないので、デバッグパネルの「追加」で置く)
 */
export const TEST_INITIAL: LocalInitial = {
  directory: {stock: SAMPLE_DIRECTORY_STOCK},
  "dummy-1": {scope: "personal"},
  "dummy-2": {scope: "shared"},
  "dummy-3": {scope: "personal", availability: "unavailable"},
};
