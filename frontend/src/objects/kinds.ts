import type {ComponentType} from "react";

import {CanvasObject} from "./canvas/CanvasObject";
import {CANVAS_KIND} from "./canvas/data";
import {DIRECTORY_FEATURES, DIRECTORY_KIND} from "./directory/data";
import {DirectoryObject} from "./directory/DirectoryObject";
import {LIGHTER_STAND_KIND} from "./lighter_stand/data";
import {LighterStandObject} from "./lighter_stand/LighterStandObject";
import {PC_KIND} from "./pc/data";
import {PcObject} from "./pc/PcObject";
import type {GameObject} from "./types";
import {WORKSPACE_KIND} from "./workspace/data";
import {WorkspaceObject} from "./workspace/WorkspaceObject";

type KindEntry = {
  Renderer: ComponentType<{object: GameObject}>;
  features: readonly string[];
};

const KINDS: Record<string, KindEntry> = {
  [DIRECTORY_KIND]: {Renderer: DirectoryObject, features: DIRECTORY_FEATURES},
  [WORKSPACE_KIND]: {Renderer: WorkspaceObject, features: []},
  [CANVAS_KIND]: {Renderer: CanvasObject, features: []},
  [PC_KIND]: {Renderer: PcObject, features: []},
  [LIGHTER_STAND_KIND]: {Renderer: LighterStandObject, features: []},
};

/** kind → 見た目(無い kind は DummyObject の箱で描く。ManagedObjects が引く) */
export const kindRenderers: Readonly<
  Record<string, ComponentType<{object: GameObject}>>
> = Object.fromEntries(
  Object.entries(KINDS).map(([kind, entry]) => [kind, entry.Renderer]),
);

/** kind が持つ機能の名前(例: directory → ["overview"]) */
export const kindFeatures = (kind: string): readonly string[] =>
  KINDS[kind]?.features ?? [];
