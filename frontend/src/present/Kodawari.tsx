import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {type CSSProperties, memo, useLayoutEffect, useRef} from "react";
import {Box3, type Group, Matrix4, Mesh, type Object3D, Vector3} from "three";

import {createRenderer} from "../core/renderer";
import {FILE_KIND} from "../items/file";
import {HeldItem} from "../items/HeldItem";
import type {Item} from "../items/types";
import {KODAWARI_CONTENT, KODAWARI_TITLE} from "./kodawariContent";
import {WorldShowcase} from "./WorldShowcase";

/**
 * 技術パートの「6 つのこだわり」。ゲームに出てくるファイル(立方体)を 2 × 3 に浮かべ、
 * こだわりの手順に入ると、全部のファイルが見出しの横へ集まり、そのこだわりのファイルだけが大きくなる。
 * どの手順でも同じ Canvas を使い続け(マウントし直さない)、ファイルの位置と大きさだけを追わせる
 */

/** ゲームで渡される、まだ手を付けていないファイル(立方体)。縁の色でこだわりを見分ける */
const cube = (color: string): Item => ({
  id: `kodawari-${color}`,
  kind: FILE_KIND,
  data: {status: "unedited", color},
});

const KODAWARI = KODAWARI_CONTENT.map((k) => ({...k, item: cube(k.color)}));

/** 一覧なら index は null。count は出している箇条書きの項目の数 */
export interface KodawariFocus {
  index: number | null;
  count: number;
}

/** 技術パートの手順 id がこだわりの手順なら、見せるこだわりと項目の数。違えば undefined */
export const kodawariFocusOf = (stepId: string): KodawariFocus | undefined => {
  if (stepId === "kodawari") {
    return {index: null, count: 0};
  }
  const index = KODAWARI.findIndex((k) => stepId.startsWith(`k-${k.key}/`));
  if (index === -1) {
    return undefined;
  }
  return {index, count: Number(stepId.slice(stepId.indexOf("/") + 1))};
};

/** 画面の割合での位置(左上が 0, 0)。HTML の文字と 3D のファイルで同じ値を使う */
type ScreenPoint = readonly [x: number, y: number];

const GRID: readonly ScreenPoint[] = [0.2, 0.5, 0.8].flatMap((x) =>
  [0.36, 0.7].map((y) => [x, y] as const),
);
/** 2 × 3 を左上から横に並べる順にする */
const gridOf = (i: number): ScreenPoint =>
  GRID[(i % 3) * 2 + Math.floor(i / 3)]!;
/** 一覧で、ファイルの下に名前を置く距離 */
const LABEL_BELOW = 0.16;
/** こだわりの手順で、ファイルを置く見出しの横 */
const HEADING: ScreenPoint = [0.1, 0.14];

/** 立方体の大きさ(画面の高さに対する割合) */
const GRID_SIZE = 0.13;
const HEADING_SIZE = 0.12;
/** 位置と大きさが目標へ寄る速さ(1/秒)。消えるときは箇条書きに重ならないよう速く縮める */
const FOLLOW = 5;
const VANISH = 14;

/** モデルを、いちばん長い辺が 1 で中心が原点になるように置く(親の大きさが 0 でも測れるよう、ローカルの行列で測る) */
const useFitToUnit = () => {
  const fit = useRef<Group>(null);
  useLayoutEffect(() => {
    const g = fit.current;
    if (!g) {
      return;
    }
    const box = new Box3();
    const local = new Matrix4();
    g.traverse((o) => {
      if (!(o instanceof Mesh)) {
        return;
      }
      local.identity();
      for (let n: Object3D | null = o; n && n !== g; n = n.parent) {
        n.updateMatrix();
        local.premultiply(n.matrix);
      }
      o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox!.clone().applyMatrix4(local));
    });
    const size = box.getSize(new Vector3());
    const s = 1 / Math.max(size.x, size.y, size.z);
    g.scale.setScalar(s);
    g.position.copy(box.getCenter(new Vector3()).multiplyScalar(-s));
  }, []);
  return fit;
};

function FloatingFile({
  item,
  index,
  focus,
}: {
  item: Item;
  index: number;
  focus: number | null;
}) {
  const outer = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const fit = useFitToUnit();
  const viewport = useThree((s) => s.viewport);

  useFrame(({clock}, dt) => {
    const g = outer.current;
    const turn = spin.current;
    if (!g || !turn) {
      return;
    }
    const shown = focus === null || focus === index;
    // こだわりの手順に入ったら全部を見出しの横に集め、見せる 1 つだけを大きくする(入れ替わりはその場で起きる)
    const [px, py] = focus === null ? gridOf(index) : HEADING;
    const size = !shown ? 0 : focus === null ? GRID_SIZE : HEADING_SIZE;
    const k = 1 - Math.exp(-dt * (shown ? FOLLOW : VANISH));
    const move = 1 - Math.exp(-dt * FOLLOW);
    g.position.x += ((px - 0.5) * viewport.width - g.position.x) * move;
    g.position.y += ((0.5 - py) * viewport.height - g.position.y) * move;
    const scale = size * viewport.height;
    g.scale.setScalar(g.scale.x + (scale - g.scale.x) * k);
    const t = clock.elapsedTime + index * 0.7;
    turn.rotation.y = t * 0.6;
    turn.position.y = Math.sin(t * 1.3) * 0.05;
  });

  const [px, py] = gridOf(index);
  return (
    <group
      ref={outer}
      position={[(px - 0.5) * viewport.width, (0.5 - py) * viewport.height, 0]}
      scale={0}
    >
      <group rotation={[0.35, 0, 0]}>
        <group ref={spin}>
          <group ref={fit}>
            <HeldItem item={item} />
          </group>
        </group>
      </group>
    </group>
  );
}

const CAMERA = {position: [0, 0, 6], fov: 30} as const;

const at = ([x, y]: ScreenPoint) => ({left: `${x * 100}%`, top: `${y * 100}%`});

/**
 * プレゼンの画面は毎フレーム描き直すので、props が変わったときだけ描き直す(Canvas を作り直させない)。
 * 新しい Canvas はシェーダーの用意に数秒かかるので、技術パートの間は隠して置いておき、こだわりの手順で出す
 */
export const KodawariStage = memo(function KodawariStage({
  shown,
  focus,
  count,
}: {
  shown: boolean;
  focus: number | null;
  count: number;
}) {
  const current = focus === null || !shown ? null : KODAWARI[focus]!;
  // 世界観の項目は、いま出している最後の項目の実物を右側に描く
  const worldScene = current?.points.slice(0, count).at(-1)?.scene ?? null;
  return (
    <div
      className="present-layer present-kodawari"
      style={shown ? undefined : {visibility: "hidden"}}
    >
      <Canvas
        className="present-kodawari-canvas"
        gl={createRenderer}
        dpr={2}
        camera={CAMERA}
        onCreated={({gl}) => gl.setClearColor("#000", 1)}
      >
        {KODAWARI.map((k, i) => (
          <FloatingFile key={k.key} item={k.item} index={i} focus={focus} />
        ))}
      </Canvas>
      <WorldShowcase scene={worldScene} />
      {!shown ? null : current === null ? (
        <>
          <h2 className="present-kodawari-heading">{KODAWARI_TITLE}</h2>
          {KODAWARI.map((k, i) => {
            const [x, y] = gridOf(i);
            return (
              <div
                key={k.key}
                className="present-kodawari-label"
                style={at([x, y + LABEL_BELOW])}
              >
                {k.label}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <h2 className="present-kodawari-heading" data-beside="true">
            {current.title}
          </h2>
          <ul
            className="present-outline present-kodawari-points"
            data-beside={worldScene !== null}
            style={{"--kodawari-color": current.color} as CSSProperties}
          >
            {current.points.slice(0, count).map(({text, sub}) => (
              <li key={text}>
                <span className="present-kodawari-point">{text}</span>
                {sub && (
                  <ul>
                    {sub.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
});
