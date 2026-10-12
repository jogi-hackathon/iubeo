import type {ToggleInitial} from "../../../core/toggles";
import {featureKey} from "../../../objects/layout";
import type {TutorialFlowState} from "../../../tutorial";
import type {TutorialEvent, TutorialStepId} from "./steps";

export const TUTORIAL_OBJECT_KEYS = [
  "workspace",
  "directory",
  "canvas",
  "pc",
] as const;

export type TutorialObjectKey = (typeof TUTORIAL_OBJECT_KEYS)[number];

export type TutorialLook = {
  visible: readonly TutorialObjectKey[];
  enabled: readonly TutorialObjectKey[];
  highlighted: readonly TutorialObjectKey[];
  pickupFile: boolean;
};

const WS_DIR: readonly TutorialObjectKey[] = ["workspace", "directory"];
const WS_DIR_CANVAS: readonly TutorialObjectKey[] = [...WS_DIR, "canvas"];

export const HIDDEN_LOOK: TutorialLook = {
  visible: [],
  enabled: [],
  highlighted: [],
  pickupFile: false,
};

/** 終えたあとは全部見せ、PC(デスクトップの接続)だけ触れる */
export const COMPLETED_LOOK: TutorialLook = {
  visible: TUTORIAL_OBJECT_KEYS,
  enabled: ["pc"],
  highlighted: [],
  pickupFile: false,
};

const STEP_LOOKS: Record<TutorialStepId, TutorialLook> = {
  chair: HIDDEN_LOOK,
  workspaceCreate: {
    visible: ["workspace"],
    enabled: ["workspace"],
    highlighted: ["workspace"],
    pickupFile: false,
  },
  directoryStoreCreated: {
    visible: WS_DIR,
    enabled: ["directory"],
    highlighted: ["directory"],
    pickupFile: false,
  },
  takeFile: {
    visible: WS_DIR,
    enabled: [],
    highlighted: [],
    pickupFile: true,
  },
  workspaceEdit: {
    visible: WS_DIR,
    enabled: ["workspace"],
    highlighted: ["workspace"],
    pickupFile: false,
  },
  directoryStoreEdited: {
    visible: WS_DIR,
    enabled: ["directory"],
    highlighted: ["directory"],
    pickupFile: false,
  },
  canvasCreate: {
    visible: WS_DIR_CANVAS,
    enabled: ["canvas"],
    highlighted: ["canvas"],
    pickupFile: false,
  },
  directoryStoreImage: {
    visible: WS_DIR_CANVAS,
    enabled: ["directory"],
    highlighted: ["directory"],
    pickupFile: false,
  },
  bootPc: {
    visible: TUTORIAL_OBJECT_KEYS,
    enabled: ["pc"],
    highlighted: ["pc"],
    pickupFile: false,
  },
};

export const calmLook = (look: TutorialLook): TutorialLook => ({
  visible: look.visible,
  enabled: [],
  highlighted: [],
  pickupFile: false,
});

export const reveals = (current: TutorialLook, next: TutorialLook): boolean =>
  next.visible.some((key) => !current.visible.includes(key)) ||
  (next.pickupFile && !current.pickupFile);

export const lookFor = (
  state: TutorialFlowState<TutorialEvent>,
): TutorialLook => {
  if (state.status === "completed") {
    return COMPLETED_LOOK;
  }
  if (state.status === "idle") {
    return HIDDEN_LOOK;
  }
  return STEP_LOOKS[state.step.id as TutorialStepId] ?? HIDDEN_LOOK;
};

export const toggleInitialFor = (look: TutorialLook): ToggleInitial => ({
  hidden: TUTORIAL_OBJECT_KEYS.filter((key) => !look.visible.includes(key)),
  disabled: [
    ...TUTORIAL_OBJECT_KEYS.filter((key) => !look.enabled.includes(key)),
    featureKey("directory", "overview"),
  ],
  highlighted: look.highlighted,
});
