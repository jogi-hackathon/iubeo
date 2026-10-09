import {MULTIPLAYER_LAYOUT} from "../dev/multiplayer/layout";
import type {SceneLayout} from "../objects/layout";
import {ROOM_LAYOUT} from "./RoomScene/layout";
import {SANDBOX_LAYOUT} from "./SandboxScene/layout";
import {TEST_LAYOUT} from "./TestScene/layout";

/**
 * シーンごとのレイアウト(置くオブジェクトと置き場所)。シーンの LocalAuthority が、この表から物を置く
 * (planLocalObjects)。シーンのコンポーネントを読まない純粋な表(テストや開発の初期化から読める)
 */
export const sceneLayouts = {
  room: ROOM_LAYOUT,
  sandbox: SANDBOX_LAYOUT,
  test: TEST_LAYOUT,
  multiplayer: MULTIPLAYER_LAYOUT,
} as const satisfies Record<string, SceneLayout>;
