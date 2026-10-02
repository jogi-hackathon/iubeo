import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

import type {CoreMesh, LooseSheet, Sheet} from "./mountain";
import {sheetSeed} from "./paperMaterial";

// 山のジオメトリ。AO をベイクできるよう(src/bake)、通常の mesh のジオメトリにして、uv(チャートごとに [0,1]²)と、
// チャートを分ける groups(箱は面ごと、芯は段ごとの側面・上面)を持たせる。マテリアルは 1 つなので、groups は描画には影響しない

/** 芯。法線は、チャート(側面・上面)の中でだけ滑らかにする */
export const buildCoreGeometry = ({
  positions,
  uvs,
  indices,
  groups,
}: CoreMesh): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  for (const {start, count} of groups) {
    g.addGroup(start, count, 0);
  }
  g.computeVertexNormals();
  return g;
};

const BOX_VERTICES = 24;
const BOX_INDICES = 36;

/**
 * 束の本と、はみ出す紙を、1 つのジオメトリにまとめる(1 回の描画)。箱 1 つは 24 頂点・12 三角形・6 チャート(面ごと)。
 * 本の描き分け(paperMaterial)のために、頂点ごとに、箱のローカル位置 `bookLocal`(-0.5〜0.5)・ローカル法線 `bookNormal`・
 * 箱の大きさと seed `sheetInfo`(幅, 厚み, 奥行き, seed)・色 `color` を持たせる。
 * はみ出す紙は、ローカル法線をすべて下向きにして、全面を無地(表紙の扱い)にする。
 */
export const buildSheetsGeometry = (
  sheets: readonly Sheet[],
  looseSheets: readonly LooseSheet[],
): BufferGeometry => {
  const box = new BoxGeometry(1, 1, 1);
  const boxPosition = box.getAttribute("position");
  const boxNormal = box.getAttribute("normal");
  const boxUV = box.getAttribute("uv");
  const boxIndex = box.getIndex();
  if (!boxIndex) {
    throw new Error("BoxGeometry に index がありません");
  }

  const count = sheets.length + looseSheets.length;
  const position = new Float32Array(count * BOX_VERTICES * 3);
  const normal = new Float32Array(count * BOX_VERTICES * 3);
  const uv = new Float32Array(count * BOX_VERTICES * 2);
  const bookLocal = new Float32Array(count * BOX_VERTICES * 3);
  const bookNormal = new Float32Array(count * BOX_VERTICES * 3);
  const sheetInfo = new Float32Array(count * BOX_VERTICES * 4);
  const colors = new Float32Array(count * BOX_VERTICES * 3);
  const indices: number[] = [];
  const g = new BufferGeometry();

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const translation = new Vector3();
  const scale = new Vector3();
  const v = new Vector3();
  const color = new Color();

  const add = (
    b: number,
    s: {position: Sheet["position"]; size: Sheet["size"]; color: string},
    plain: boolean,
  ) => {
    matrix.compose(
      translation.set(...s.position),
      quaternion.setFromEuler(euler),
      scale.set(...s.size),
    );
    color.set(s.color);
    const base = b * BOX_VERTICES;
    for (let k = 0; k < BOX_VERTICES; k++) {
      const i = base + k;
      v.fromBufferAttribute(boxPosition, k);
      bookLocal.set([v.x, v.y, v.z], i * 3);
      v.applyMatrix4(matrix);
      position.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(boxNormal, k);
      bookNormal.set(plain ? [0, -1, 0] : [v.x, v.y, v.z], i * 3);
      // 箱の面の法線は軸に沿うので、拡縮があっても、回転だけ掛ければよい
      v.applyQuaternion(quaternion);
      normal.set([v.x, v.y, v.z], i * 3);
      uv.set([boxUV.getX(k), boxUV.getY(k)], i * 2);
      sheetInfo.set([...s.size, sheetSeed(b)], i * 4);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    for (let k = 0; k < BOX_INDICES; k++) {
      indices.push(base + boxIndex.getX(k));
    }
    for (const group of box.groups) {
      g.addGroup(b * BOX_INDICES + group.start, group.count, 0);
    }
  };

  sheets.forEach((s, i) => {
    euler.set(0, s.yaw, 0, "XYZ");
    add(i, s, false);
  });
  looseSheets.forEach((s, i) => {
    euler.set(...s.rotation, "YXZ");
    add(sheets.length + i, s, true);
  });
  box.dispose();

  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("bookLocal", new Float32BufferAttribute(bookLocal, 3));
  g.setAttribute("bookNormal", new Float32BufferAttribute(bookNormal, 3));
  g.setAttribute("sheetInfo", new Float32BufferAttribute(sheetInfo, 4));
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
};
