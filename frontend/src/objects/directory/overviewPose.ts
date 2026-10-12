import {Euler, type Quaternion} from "three";

import type {Vec3} from "../../props/types";
import {
  type MountainSizeName,
  mountainHeightMax,
  mountainReach,
  mountainViewHeight,
  mountainViewOffset,
} from "./mountain";

export const CAMERA_FOV = 75;
const FIT_RATIO = 0.9;
const SUMMIT_MARGIN = 1.5;

export const overviewHeight = (size: MountainSizeName): number =>
  Math.max(
    mountainReach(size) /
      (FIT_RATIO * Math.tan((CAMERA_FOV / 2) * (Math.PI / 180))),
    mountainHeightMax(size) + SUMMIT_MARGIN,
    mountainViewHeight(size),
  );

export const OVERVIEW_HEIGHT = overviewHeight("large");

export type OverviewPose = {position: Vec3; yaw: number};

export const computeOverviewPose = (
  center: Vec3,
  playerYaw: number,
  size: MountainSizeName = "large",
): OverviewPose => {
  const offset = mountainViewOffset(size);
  return {
    position: [
      center[0] + offset.x,
      center[1] + overviewHeight(size),
      center[2] + offset.z,
    ],
    yaw: playerYaw,
  };
};

const euler = new Euler(0, 0, 0, "YXZ");

export const overviewQuaternion = (
  pose: OverviewPose,
  out: Quaternion,
): Quaternion => out.setFromEuler(euler.set(-Math.PI / 2, pose.yaw, 0));
