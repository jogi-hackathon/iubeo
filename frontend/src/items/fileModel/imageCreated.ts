import {type FilePart, type FileModel, paper} from "./parts";

const FRAME_WIDTH = 0.1;
const FRAME_HEIGHT = 0.08;
const FRAME_BAR = 0.012;
const FRAME_DEPTH = 0.008;
const FRAME_OUTLINE = 0.004;
const SUN_RADIUS = 0.01;
const SUN_SIDES = 16;
const BAR_DEPTH = FRAME_DEPTH + 0.002;
const CANVAS_DEPTH = 0.004;
const INNER_WIDTH = FRAME_WIDTH - 2 * FRAME_BAR;
const INNER_HEIGHT = FRAME_HEIGHT - 2 * FRAME_BAR;
const MOUNTAIN_DEPTH = FRAME_DEPTH + 0.002;
const TRIANGLE_HALF_WIDTH = Math.sqrt(3) / 2;
const TRIANGLE_HEIGHT = 1.5;

const frameBar = (
  position: [number, number, number],
  scale: [number, number, number],
): FilePart => ({shape: "box", look: "ink", position, scale});

const SUN_APOTHEM = SUN_RADIUS * Math.cos(Math.PI / SUN_SIDES);
const SUN_SIDE = 2 * SUN_APOTHEM * Math.tan(Math.PI / SUN_SIDES);

const sun = (x: number, y: number): FilePart[] =>
  Array.from({length: SUN_SIDES / 2}, (_, i) => ({
    shape: "box" as const,
    look: "ink" as const,
    position: [x, y, 0] as [number, number, number],
    scale: [2 * SUN_APOTHEM, SUN_SIDE, MOUNTAIN_DEPTH] as [
      number,
      number,
      number,
    ],
    rotation: [0, 0, (i * 2 * Math.PI) / SUN_SIDES] as [number, number, number],
  }));

const mountain = (x: number, width: number, height: number): FilePart => ({
  shape: "prism",
  look: "ink",
  position: [x, -INNER_HEIGHT / 2 + height / 3 - 0.004, 0],
  scale: [
    width / (2 * TRIANGLE_HALF_WIDTH),
    MOUNTAIN_DEPTH,
    height / TRIANGLE_HEIGHT,
  ],
  rotation: [-Math.PI / 2, 0, 0],
});

export const IMAGE_CREATED: FileModel = {
  parts: [
    paper([0, 0, 0], [FRAME_WIDTH, FRAME_HEIGHT, FRAME_DEPTH]),
    {
      shape: "box",
      look: "blank",
      position: [0, 0, 0],
      scale: [INNER_WIDTH, INNER_HEIGHT, CANVAS_DEPTH],
    },
    mountain(-0.014, 0.036, 0.03),
    mountain(0.021, 0.024, 0.02),
    ...sun(0.024, 0.012),
    frameBar(
      [0, (FRAME_HEIGHT - FRAME_BAR) / 2, 0],
      [FRAME_WIDTH, FRAME_BAR, BAR_DEPTH],
    ),
    frameBar(
      [0, -(FRAME_HEIGHT - FRAME_BAR) / 2, 0],
      [FRAME_WIDTH, FRAME_BAR, BAR_DEPTH],
    ),
    frameBar(
      [(FRAME_WIDTH - FRAME_BAR) / 2, 0, 0],
      [FRAME_BAR, INNER_HEIGHT, BAR_DEPTH],
    ),
    frameBar(
      [-(FRAME_WIDTH - FRAME_BAR) / 2, 0, 0],
      [FRAME_BAR, INNER_HEIGHT, BAR_DEPTH],
    ),
  ],
  outline: FRAME_OUTLINE,
};
