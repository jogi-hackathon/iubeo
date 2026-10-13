import "./toneSilence";
import {getContext} from "tone/build/esm/core/Global.js";

export * from "tone/build/esm/classes.js";
export {getContext, setContext} from "tone/build/esm/core/Global.js";

export const now = () => getContext().now();
