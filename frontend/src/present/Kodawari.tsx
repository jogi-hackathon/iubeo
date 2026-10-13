import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {memo, useLayoutEffect, useRef} from "react";
import {Box3, type Group, Matrix4, Mesh, type Object3D, Vector3} from "three";

import {createRenderer} from "../core/renderer";
import {FILE_KIND} from "../items/file";
import {HeldItem} from "../items/HeldItem";
import type {Item} from "../items/types";

/**
 * 技術パートの「6 つのこだわり」。ゲームに出てくるファイル(立方体)を 2 × 3 に浮かべ、
 * こだわりの手順に入ると、そのファイルが見出しの横へ移り、前のファイルは縮んで消える。
 * どの手順でも同じ Canvas を使い続け(マウントし直さない)、ファイルの位置と大きさだけを追わせる
 */

interface Point {
  text: string;
  sub?: readonly string[];
}

interface Kodawari {
  step: string;
  label: string;
  title: string;
  item: Item;
  points: readonly Point[];
}

/** ゲームで渡される、まだ手を付けていないファイル(立方体)。縁の色でこだわりを見分ける */
const cube = (color: string): Item => ({
  id: `kodawari-${color}`,
  kind: FILE_KIND,
  data: {status: "unedited", color},
});

const KODAWARI: readonly Kodawari[] = [
  {
    step: "k-browser",
    label: "ブラウザ",
    title: "ブラウザへのこだわり",
    item: cube("#4f8cff"),
    points: [
      {
        text: "本物の Firefox のエンジンを Wasm で動かした",
        sub: ["iframe でも画面のモックでもない"],
      },
      {
        text: "firefox-wasm をフォークして JIT と日本語表示を改善した",
        sub: ["github.com/thirdlf03/firefox-wasm"],
      },
      {text: "Wisp で TCP/UDP を WebSocket の上に通した"},
      {
        text: "検索画面を Brave Search API で自作した",
        sub: ["Google 検索だと Bot と判定されるため"],
      },
      {text: "お題に合っているかは Workers AI の Clef で判定した"},
    ],
  },
  {
    step: "k-cf",
    label: "cf",
    title: "cf へのこだわり",
    item: cube("#f38020"),
    points: [
      {text: "wrangler ではなくベータ版の新しい CLI cf を使った"},
      {
        text: "インフラを cloudflare.config.ts 1 ファイルに型付きで書いた",
        sub: [
          "Worker 3・コンテナ 2・Durable Object・KV・Workers AI・Rate Limit",
        ],
      },
      {
        text: "Worker の入口を import で参照した",
        sub: ["ファイルを動かすと型検査で気づける"],
      },
      {
        text: "ドキュメントに無い挙動に実機で当たりながら進めた",
        sub: [
          "既定の設定ではコンテナに署名鍵を渡せず Go サーバーが起動しなかった",
        ],
      },
    ],
  },
  {
    step: "k-perf",
    label: "パフォーマンス",
    title: "パフォーマンスへのこだわり",
    item: cube("#34c759"),
    points: [
      {text: "計測の仕組みを作り、道具の誤りから先に直した"},
      {
        text: "20Hz の位置だけを 25 バイトのバイナリにした",
        sub: ["1 クライアントの受信ペイロード 11,945 → 1,700 B/秒(−86%)"],
      },
      {
        text: "33 MB の wasm を起動の裏で取っておいた",
        sub: ["4G で PC のブラウザが使えるまで 93.7 秒 → 1.3 秒"],
      },
      {
        text: "大阪のコンテナに 9 クライアントでつないで実測した",
        sub: ["RTT p50 56.8ms・20Hz を維持・切断 0"],
      },
    ],
  },
  {
    step: "k-voice",
    label: "立体音響",
    title: "立体音響へのこだわり",
    item: cube("#ff5fa2"),
    points: [
      {text: "MoQ / WebTransport の datagram で Opus を送った"},
      {text: "ゲームサーバーの座標で相手ごとに距離減衰をかけた"},
      {text: "セッションに紐づいた JWT で別のゲームに声が漏れないようにした"},
      {text: "VC サービスと MoQ リレーはチームメンバーが別ホストで動かした"},
    ],
  },
  {
    step: "k-three",
    label: "Three.js",
    title: "Three.js へのこだわり",
    item: cube("#a78bfa"),
    points: [
      {
        text: "Babylon.js ではなく Three.js + React Three Fiber を選んだ",
        sub: [
          "Babylon.js は機能が多すぎてバンドルも大きく、AI で書くと品質が落ちた",
        ],
      },
      {
        text: "ゲームエンジンが受け持つ部分を自分たちで作った",
        sub: [
          "当たり判定と一人称の移動・シーン遷移・TSL のポストプロセス・シェーダーのウォームアップ・AO の GPU ベイク",
        ],
      },
      {
        text: "状態の送り元を差し替えられるようにした",
        sub: ["チュートリアルはブラウザ内の簡易サーバー、本番は Go のサーバー"],
      },
    ],
  },
  {
    step: "k-world",
    label: "世界観",
    title: "世界観へのこだわり",
    item: cube("#e8e8e8"),
    points: [
      {text: "窓の外に 0 と 1 で描いたデータの海を作った"},
      {text: "脱落すると体がラグドールになって燃えて欠けていくようにした"},
      {text: "画像生成はノイズから絵が現れるようにした"},
      {text: "ライターで火をつけるとディレクトリが侵食されて消えるようにした"},
      {text: "部屋の PC で Windows 2000 風のデスクトップを動かした"},
      {text: "WebGPU 専用にし、影を使わず半球光と AO だけで陰影を付けた"},
    ],
  },
];

/**
 * 技術パートの手順 id がこだわりの手順なら、見せるこだわりの番号(一覧なら null)。違えば undefined
 */
export const kodawariFocusOf = (stepId: string): number | null | undefined => {
  if (stepId === "kodawari") {
    return null;
  }
  const i = KODAWARI.findIndex((k) => k.step === stepId);
  return i === -1 ? undefined : i;
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
const HEADING: ScreenPoint = [0.075, 0.12];

/** 立方体の大きさ(画面の高さに対する割合) */
const GRID_SIZE = 0.13;
const HEADING_SIZE = 0.08;
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
    const [px, py] = focus === index ? HEADING : gridOf(index);
    const size = !shown ? 0 : focus === null ? GRID_SIZE : HEADING_SIZE;
    const k = 1 - Math.exp(-dt * (shown ? FOLLOW : VANISH));
    // 消えるファイルはその場で縮む(位置は追わない)
    if (shown) {
      g.position.x += ((px - 0.5) * viewport.width - g.position.x) * k;
      g.position.y += ((0.5 - py) * viewport.height - g.position.y) * k;
    }
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
}: {
  shown: boolean;
  focus: number | null;
}) {
  const current = focus === null || !shown ? null : KODAWARI[focus]!;
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
          <FloatingFile key={k.step} item={k.item} index={i} focus={focus} />
        ))}
      </Canvas>
      {!shown ? null : current === null ? (
        <>
          <h2 className="present-kodawari-heading">6 つのこだわり</h2>
          {KODAWARI.map((k, i) => {
            const [x, y] = gridOf(i);
            return (
              <div
                key={k.step}
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
          <ul className="present-outline present-kodawari-points">
            {current.points.map(({text, sub}) => (
              <li key={text}>
                {text}
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
