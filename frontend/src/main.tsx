import {StrictMode} from "react";
import {createRoot} from "react-dom/client";

import {BootScreen} from "./boot/BootScreen";

import "./style.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}

createRoot(root).render(
  <StrictMode>
    <BootScreen />
  </StrictMode>,
);
