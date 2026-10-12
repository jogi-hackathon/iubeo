import {
  type FileModel,
  paper,
  SHEET_DEPTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  textLines,
  THIN_OUTLINE,
} from "./parts";

const STACK_GAP = 0.01;
const SHEET_SIZE: [number, number, number] = [
  SHEET_WIDTH,
  SHEET_HEIGHT,
  SHEET_DEPTH,
];

export const EDITED: FileModel = {
  parts: [
    paper([-0.009, -0.003, -STACK_GAP], SHEET_SIZE),
    paper([0.009, 0.003, 0], SHEET_SIZE, [0, 0, -0.03]),
    paper([0, 0, STACK_GAP], SHEET_SIZE),
    ...textLines(STACK_GAP),
    ...textLines(-STACK_GAP),
  ],
  outline: THIN_OUTLINE,
};
