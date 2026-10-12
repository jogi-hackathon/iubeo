import {screenUV, uniform, uv, vec4} from "three/tsl";
import {MeshBasicNodeMaterial, Vector2} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {crtEffect} from "../../objects/pc/crtMaterial";
import {SCREEN_CANVAS} from "../../screen/browserChrome";
import {proxyView} from "./proxyView";

export const portalCrt = {
  on: uniform(0),
  boot: uniform(0),
  strength: uniform(1),
  time: uniform(0),
};

export const createPortalMaterial = (): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  const col = crtEffect({
    sampleAt: (uvNode) =>
      proxyView.textureNode.sample(screenUV.add(uvNode.sub(uv()))),
    uvNode: uv(),
    on: portalCrt.on,
    boot: portalCrt.boot,
    time: portalCrt.time,
    resolution: uniform(new Vector2(SCREEN_CANVAS.width, SCREEN_CANVAS.height)),
    strength: portalCrt.strength,
  });
  material.colorNode = vec4(col, 1);
  material.toneMapped = false;
  material.fog = false;
  setSkipGTAO(material, true);
  return material;
};
