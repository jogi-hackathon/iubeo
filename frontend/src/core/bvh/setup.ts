import {BufferGeometry, Mesh} from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

// 副作用 import 用。three 側の型拡張(boundsTree 等)は three-mesh-bvh 自身が提供する
BufferGeometry.prototype.computeBoundsTree =
  computeBoundsTree as unknown as typeof BufferGeometry.prototype.computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;
