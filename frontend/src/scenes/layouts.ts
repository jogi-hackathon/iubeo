import type {SceneLayout} from "../objects/layout";
import {ROOM_LAYOUT} from "./RoomScene/layout";
import {SANDBOX_LAYOUT} from "./SandboxScene/layout";
import {TEST_LAYOUT} from "./TestScene/layout";

export const sceneLayouts = {
  room: ROOM_LAYOUT,
  sandbox: SANDBOX_LAYOUT,
  test: TEST_LAYOUT,
} as const satisfies Record<string, SceneLayout>;
