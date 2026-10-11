import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {BootScreen} from "./boot/BootScreen";
import {filterThreeLog} from "./core/threeLog";

import "./style.css";

// React を始める前に入れる(最初の描画で three の警告が出るため)
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
