import type {Recipe, SfxId} from "../types";
import {canvas} from "./canvas";
import {clefNo} from "./clefNo";
import {clefOk} from "./clefOk";
import {corrupt} from "./corrupt";
import {deadline} from "./deadline";
import {dive} from "./dive";
import {done} from "./done";
import {filePick} from "./filePick";
import {key} from "./key";
import {match} from "./match";
import {pcFan} from "./pcFan";
import {save} from "./save";
import {shatter} from "./shatter";
import {slip} from "./slip";
import {window} from "./window";
import {writing} from "./writing";

export const RECIPES: {[K in SfxId]: Recipe<K>} = {
  pcFan,
  writing,
  shatter,
  key,
  window,
  filePick,
  save,
  clefOk,
  clefNo,
  canvas,
  slip,
  done,
  deadline,
  match,
  dive,
  corrupt,
};
