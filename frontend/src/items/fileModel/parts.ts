import type {Vector3Tuple} from "three";

export type FilePartShape = "box" | "cylinder" | "prism";
export type FilePartLook = "paper" | "blank" | "ink";

export type FilePart = {
  shape: FilePartShape;
  look: FilePartLook;
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

export type FileModel = {
  parts: readonly FilePart[];
  outline: number;
};

export const SHEET_WIDTH = 0.08;
export const SHEET_HEIGHT = 0.1;
export const SHEET_DEPTH = 0.003;
export const INK_DEPTH = SHEET_DEPTH + 0.002;
export const LINE_HEIGHT = 0.005;
export const THIN_OUTLINE = 0.003;

export const paper = (
  position: Vector3Tuple,
  scale: Vector3Tuple,
  rotation?: Vector3Tuple,
): FilePart => ({
  shape: "box",
  look: "paper",
  position,
  scale,
  ...(rotation && {rotation}),
});

export const ink = (
  position: Vector3Tuple,
  scale: Vector3Tuple,
  rotation?: Vector3Tuple,
): FilePart => ({
  shape: "box",
  look: "ink",
  position,
  scale,
  ...(rotation && {rotation}),
});

export const disc = (
  look: FilePartLook,
  [x, y, z]: Vector3Tuple,
  radius: number,
  depth: number,
): FilePart => ({
  shape: "cylinder",
  look,
  position: [x, y, z],
  scale: [radius, depth, radius],
  rotation: [Math.PI / 2, 0, 0],
});

const TEXT_LINES: readonly [number, number][] = [
  [0.03, 0.06],
  [0.016, 0.06],
  [0.002, 0.06],
  [-0.012, 0.06],
  [-0.026, 0.036],
];

export const textLines = (z: number): FilePart[] =>
  TEXT_LINES.map(([y, width]) =>
    ink(
      [(width - TEXT_LINES[0]![1]) / 2, y, z],
      [width, LINE_HEIGHT, INK_DEPTH],
    ),
  );
