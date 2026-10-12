import {
  type FileModel,
  ink,
  INK_DEPTH,
  paper,
  SHEET_DEPTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from "./parts";

const OUTLINE = 0.004;
const TEXT_LINE_HEIGHT = 0.006;
const LEFT = -0.03;

const LINES: readonly [number, number][] = [
  [0.03, 0.06],
  [0.015, 0.052],
  [0, 0.06],
  [-0.015, 0.044],
  [-0.03, 0.03],
];

export const FILE_CREATED: FileModel = {
  parts: [
    paper([0, 0, 0], [SHEET_WIDTH, SHEET_HEIGHT, SHEET_DEPTH]),
    ...LINES.map(([y, width]) =>
      ink([LEFT + width / 2, y, 0], [width, TEXT_LINE_HEIGHT, INK_DEPTH]),
    ),
  ],
  outline: OUTLINE,
};
