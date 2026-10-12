import type {Recipe, SfxId} from "../types";
import {pcFan} from "./pcFan";
import {shatter} from "./shatter";
import {writing} from "./writing";

export const RECIPES: {[K in SfxId]: Recipe<K>} = {
  pcFan,
  writing,
  shatter,
};
