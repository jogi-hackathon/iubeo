/**
 * スタッフクレジットに流す行(上から順)。
 * 名前は GitHub の ID、並びはコミット数の多い順
 */
export type CreditLine =
  | {type: "logo"}
  | {type: "heading"; text: string}
  | {type: "item"; text: string}
  | {type: "gap"}
  /** ロゴの下の間。ロゴを真ん中に止めている間、次の行が画面に入らないだけ空ける(高さは ./roll が決める) */
  | {type: "opening"};

const section = (heading: string, items: readonly string[]): CreditLine[] => [
  {type: "heading", text: heading},
  ...items.map((text) => ({type: "item", text}) as const),
  {type: "gap"},
];

export const CREDIT_LINES: readonly CreditLine[] = [
  {type: "logo"},
  {type: "opening"},
  ...section("Development", ["kurazuuuuuu", "thirdlf03", "Riochin"]),
  ...section("Built with", [
    "React",
    "Three.js / React Three Fiber",
    "three-mesh-bvh",
    "firefox-wasm",
    "wisp-js",
    "Go / coder/websocket / oapi-codegen",
    "Cloudflare Workers",
    "AWS",
  ]),
  ...section("Made at", ["JOGI HACK 2026", "主催: 名城大学情報技術研究会"]),
  ...section("Special Thanks", ["And you, for staring out the window."]),
  {type: "item", text: "Thank you for playing."},
];
