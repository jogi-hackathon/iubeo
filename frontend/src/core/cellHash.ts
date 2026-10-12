import {hash, uint} from "three/tsl";
import type {Node} from "three/webgpu";

export const cellHash = (
  cell: Node<"vec2">,
  step: Node<"float">,
  n: number,
): Node<"float"> =>
  hash(
    cell.x
      .toUint()
      .add(cell.y.toUint().mul(uint(4099)))
      .add(step.toUint().mul(uint(65537)))
      .add(uint(n * 7919)),
  );
