import {useLayoutEffect, useRef} from "react";
import type {Group} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {
  addPowerOutline,
  GUIDE_OUTLINE,
} from "../../camera/postprocess/powerOutlineSelection";
import {
  FILE_PLATE_LIFT,
  FilePlateMesh,
} from "../../objects/directory/DirectoryOverview";
import {
  OBJECT_ID_KEY,
  registerClientTarget,
  registerTarget,
} from "../../objects/interaction";
import {
  TUTORIAL_FILE_CANDIDATE,
  tutorialFileWorldPosition,
} from "./tutorialFilePlate";

export const TUTORIAL_FILE_ID = "room.tutorial-file";
export const TUTORIAL_FILE_COLOR = "#2a9d5c";

const HIT_MARGIN = 0.1;
const HIT_HEIGHT = 0.1;

export function TutorialFile({onTake}: {onTake: () => void}) {
  const root = useRef<Group>(null);
  const take = useRef(onTake);
  take.current = onTake;

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) {
      return;
    }
    const offTarget = registerTarget(TUTORIAL_FILE_ID, group);
    const offClient = registerClientTarget(TUTORIAL_FILE_ID, {
      interact: () => take.current(),
    });
    const offOutline = addPowerOutline(group, {
      ignoreDistance: true,
      ...GUIDE_OUTLINE,
    });
    return () => {
      offTarget();
      offClient();
      offOutline();
    };
  }, []);

  const candidate = TUTORIAL_FILE_CANDIDATE;
  if (!candidate) {
    return null;
  }
  return (
    <group
      ref={root}
      position={tutorialFileWorldPosition(candidate, FILE_PLATE_LIFT)}
      userData={{
        [OBJECT_ID_KEY]: TUTORIAL_FILE_ID,
        ...aoModeUserData("realtime"),
      }}
    >
      <FilePlateMesh
        color={TUTORIAL_FILE_COLOR}
        aimed={false}
        position={[0, 0, 0]}
        yaw={candidate.yaw}
        width={candidate.width}
        depth={candidate.depth}
      />
      <mesh visible={false} rotation={[0, candidate.yaw, 0]}>
        <boxGeometry
          args={[
            candidate.width + HIT_MARGIN,
            HIT_HEIGHT,
            candidate.depth + HIT_MARGIN,
          ]}
        />
      </mesh>
    </group>
  );
}
