import {BufferGeometry, Mesh} from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

BufferGeometry.prototype.computeBoundsTree =
  computeBoundsTree as unknown as typeof BufferGeometry.prototype.computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;
