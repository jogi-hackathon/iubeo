export const INTERACT_DISTANCE = 2.5;

export type AimHit = {objectId: string | null; distance: number};

type AimOptions = {
  maxDistance?: number;
  isTargetable: (objectId: string) => boolean;
};

export const resolveAim = (
  firstHit: AimHit | null,
  {maxDistance = INTERACT_DISTANCE, isTargetable}: AimOptions,
): string | null => {
  if (!firstHit || firstHit.objectId === null) {
    return null;
  }
  if (firstHit.distance > maxDistance) {
    return null;
  }
  return isTargetable(firstHit.objectId) ? firstHit.objectId : null;
};
