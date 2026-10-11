import {rowStyle} from "../core/debug/ui";
import {tutorialManager, useTutorial, useTutorialFlow} from "../tutorial";

export function TutorialPanel() {
  const {completed} = useTutorial();
  const flow = useTutorialFlow();
  const step =
    flow.status === "running"
      ? ` · ${flow.stepIndex + 1}: ${flow.step.id}`
      : "";
  return (
    <>
      <div>tutorial: {completed ? "完了" : "未完了"}</div>
      <div>
        flow: {flow.status}
        {step}
      </div>
      <div style={rowStyle}>
        <button type="button" onClick={() => tutorialManager.complete()}>
          complete
        </button>
        <button type="button" onClick={() => tutorialManager.reset()}>
          reset
        </button>
      </div>
    </>
  );
}
