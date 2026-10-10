import {
  abs,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  mix,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  MeshBasicNodeMaterial,
  type Node,
  type Texture,
  Vector2,
} from "three/webgpu";

export type CrtControls = {
  material: MeshBasicNodeMaterial;
  /** 電源の立ち上がり 0..1 */
  on: {value: number};
  /** 起動成功後のラスタ展開 0..1 */
  boot: {value: number};
  time: {value: number};
};

export const createCrtMaterial = (
  map: Texture,
  width: number,
  height: number,
): CrtControls => {
  const uTime = uniform(0);
  const uOn = uniform(0);
  const uBoot = uniform(0);
  const uResolution = uniform(new Vector2(width, height));
  const uMask = float(0.55);
  const uScanline = float(0.7);

  const uvNode = uv();
  const c = uvNode.sub(vec2(0.5, 0.5));

  const aberr = dot(c, c).mul(0.0024);
  let col: Node<"vec3"> = vec3(
    texture(map, uvNode.add(c.mul(aberr))).r,
    texture(map, uvNode).g,
    texture(map, uvNode.sub(c.mul(aberr))).b,
  );

  const texel = max(fwidth(uvNode), vec2(1, 1).div(uResolution));
  const grille = sin(uvNode.x.mul(Math.PI).div(texel.x)).mul(0.5).add(0.5);
  col = col.mul(float(1).sub(uMask.mul(0.26).mul(grille)));
  const scan = sin(uvNode.y.mul(Math.PI).div(texel.y)).mul(0.5).add(0.5);
  col = col.mul(float(1).sub(uScanline.mul(0.3).mul(scan)));

  const tubeR = length(c.mul(vec2(1, 0.88))).mul(1.34);
  const vig = float(1).sub(smoothstep(0.18, 1.0, tubeR));
  col = col.mul(mix(0.62, 1.0, vig));
  col = col.add(col.mul(vig).mul(0.18));

  col = col.div(float(1).add(col.mul(0.22)));

  const sheen = float(1).sub(
    smoothstep(0.0, 0.95, length(c.sub(vec2(-0.3, 0.36)))),
  );
  col = col.add(
    vec3(0.03, 0.036, 0.048)
      .mul(sheen)
      .mul(mix(1.0, 0.45, uOn)),
  );

  const tube = mix(0.006, 1.0, clamp(uBoot, 0, 1));
  const y = abs(c.y).mul(2);
  col = col.mul(float(1).sub(smoothstep(tube, tube.add(0.012), y)));
  const band = abs(y.sub(tube));
  col = col.add(
    vec3(0.65, 0.8, 1.0)
      .mul(float(1).sub(smoothstep(0, 0.09, band)))
      .mul(float(1).sub(tube))
      .mul(1.7),
  );
  const noise = fract(
    sin(
      dot(uvNode.mul(uResolution).add(uTime.mul(13)), vec2(12.9898, 78.233)),
    ).mul(43758.5453),
  );
  col = col.add(noise.sub(0.5).mul(0.13).mul(float(1).sub(tube)));

  col = col.mul(uOn);
  col = col.add(vec3(0.01, 0.012, 0.02).mul(float(1).sub(uOn)));
  const hum = sin(uvNode.y.mul(7).add(uTime.mul(0.7)))
    .mul(0.5)
    .add(0.5);
  col = col.add(vec3(0.006).mul(hum).mul(float(1).sub(tube)));
  col = col.mul(float(1).add(sin(uTime.mul(43)).mul(0.014).mul(uOn)));

  const material = new MeshBasicNodeMaterial();
  material.colorNode = vec4(col, 1);
  material.toneMapped = false;
  material.fog = false;

  return {
    material,
    on: uOn,
    boot: uBoot,
    time: uTime,
  };
};
