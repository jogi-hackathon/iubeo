import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {BootScreen} from "./boot/BootScreen";
import {filterThreeLog} from "./core/threeLog";

import "./style.css";

filterThreeLog();

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}

createRoot(root).render(
  <StrictMode>
    <BootScreen />
  </StrictMode>,
);
