import type {FileStatus} from "../items";
import type {TutorialStep} from "./tutorialManager";

export type TutorialZone = "chair" | "pcFront";

export type TutorialEvent =
  | {type: "zone"; zone: TutorialZone}
  | {type: "held"; file: FileStatus | null};

export type TutorialStepId =
  | "chair"
  | "workspaceCreate"
  | "directoryStoreCreated"
  | "takeFile"
  | "workspaceEdit"
  | "directoryStoreEdited"
  | "canvasCreate"
  | "directoryStoreImage"
  | "pcFront";

const enterZone =
  (zone: TutorialZone) =>
  (event: TutorialEvent): boolean =>
    event.type === "zone" && event.zone === zone;

const holdFile =
  (file: FileStatus | null) =>
  (event: TutorialEvent): boolean =>
    event.type === "held" && event.file === file;

type Step = TutorialStep<TutorialEvent> & {id: TutorialStepId};

export const TUTORIAL_STEPS: readonly Step[] = [
  {id: "chair", advanceOn: enterZone("chair")},
  {id: "workspaceCreate", advanceOn: holdFile("file_created")},
  {id: "directoryStoreCreated", advanceOn: holdFile(null)},
  {id: "takeFile", advanceOn: holdFile("unedited")},
  {id: "workspaceEdit", advanceOn: holdFile("edited")},
  {id: "directoryStoreEdited", advanceOn: holdFile(null)},
  {id: "canvasCreate", advanceOn: holdFile("image_created")},
  {id: "directoryStoreImage", advanceOn: holdFile(null)},
  {id: "pcFront", advanceOn: enterZone("pcFront")},
];
