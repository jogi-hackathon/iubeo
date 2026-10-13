import type {Recipe, SfxId} from "../types";
import {canvas} from "./canvas";
import {clefNo} from "./clefNo";
import {clefOk} from "./clefOk";
import {click} from "./click";
import {corrupt} from "./corrupt";
import {deadline} from "./deadline";
import {dive} from "./dive";
import {done} from "./done";
import {filePick} from "./filePick";
import {flame} from "./flame";
import {glitch} from "./glitch";
import {ignite} from "./ignite";
import {jump} from "./jump";
import {key} from "./key";
import {land} from "./land";
import {match} from "./match";
import {pcFan} from "./pcFan";
import {save} from "./save";
import {shatter} from "./shatter";
import {slip} from "./slip";
import {step} from "./step";
import {swipe} from "./swipe";
import {window} from "./window";
import {writing} from "./writing";

export const RECIPES: {[K in SfxId]: Recipe<K>} = {
  pcFan,
  writing,
  shatter,
  key,
  click,
  swipe,
  step,
  jump,
  land,
  ignite,
  flame,
  glitch,
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

import.meta.hot?.accept(() => globalThis.location.reload());
