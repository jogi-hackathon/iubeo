import type {LocalInitial} from "../../authority/local/plan";
import {SAMPLE_DIRECTORY_STOCK} from "../sampleStock";

export const TEST_INITIAL: LocalInitial = {
  directory: {stock: SAMPLE_DIRECTORY_STOCK},
  "dummy-1": {scope: "personal"},
  "dummy-2": {scope: "shared"},
  "dummy-3": {scope: "personal", availability: "unavailable"},
};
