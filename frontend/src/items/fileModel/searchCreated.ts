import {disc, type FileModel, ink, LINE_HEIGHT, paper} from "./parts";

const WINDOW_WIDTH = 0.1;
const WINDOW_HEIGHT = 0.08;
const WINDOW_DEPTH = 0.004;
const TITLE_HEIGHT = 0.016;
const TITLE_Y = (WINDOW_HEIGHT - TITLE_HEIGHT) / 2;
const ON_WINDOW_DEPTH = WINDOW_DEPTH + 0.002;
const FIELD_Y = 0.008;
const OUTLINE = 0.0045;
const FIELD_WIDTH = 0.072;
const FIELD_HEIGHT = 0.022;
const FIELD_BORDER = 0.003;
const LENS: [number, number, number] = [
  FIELD_WIDTH / 2 - 0.014,
  FIELD_Y + 0.0015,
  0,
];

export const SEARCH_CREATED: FileModel = {
  parts: [
    paper([0, 0, 0], [WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_DEPTH]),
    ink(
      [0, TITLE_Y - 0.00025, 0],
      [WINDOW_WIDTH, TITLE_HEIGHT - 0.0005, ON_WINDOW_DEPTH],
    ),
    ...[0, 1, 2].map((i) =>
      disc(
        "blank",
        [-WINDOW_WIDTH / 2 + 0.01 + i * 0.009, TITLE_Y, 0],
        0.0032,
        ON_WINDOW_DEPTH + 0.002,
      ),
    ),
    ink([0, FIELD_Y, 0], [FIELD_WIDTH, FIELD_HEIGHT, ON_WINDOW_DEPTH]),
    {
      shape: "box",
      look: "blank",
      position: [0, FIELD_Y, 0],
      scale: [
        FIELD_WIDTH - 2 * FIELD_BORDER,
        FIELD_HEIGHT - 2 * FIELD_BORDER,
        ON_WINDOW_DEPTH + 0.001,
      ],
    },
    disc("ink", LENS, 0.0052, ON_WINDOW_DEPTH + 0.002),
    disc("blank", LENS, 0.003, ON_WINDOW_DEPTH + 0.003),
    ink(
      [LENS[0] + 0.0042, LENS[1] - 0.0042, 0],
      [0.005, 0.0016, ON_WINDOW_DEPTH + 0.002],
      [0, 0, -Math.PI / 4],
    ),
    ...[-0.012, -0.022].map((y, i) =>
      ink(
        [-0.006 * i - 0.004, y, 0],
        [0.064 - 0.012 * i, LINE_HEIGHT, ON_WINDOW_DEPTH],
      ),
    ),
  ],
  outline: OUTLINE,
};
