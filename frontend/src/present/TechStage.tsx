import logoUrl from "../assets/brand/iubeo_logo.svg";
import {archRouteOf, ArchDiagram} from "./ArchDiagram";
import {kodawariFocusOf, KodawariStage} from "./Kodawari";
import {stepIdOf} from "./script";
import {CLOSE_LID_DURATION_MS, progress} from "./timeline";

/**
 * 技術パート(目を開ける手前まで)。目を閉じたあとの黒い世界で、構成図と 6 つのこだわりを見せる
 */
export function TechStage({step, elapsed}: {step: number; elapsed: number}) {
  const id = stepIdOf("tech", step);
  const focus = kodawariFocusOf(id);
  return (
    <>
      {/* こだわりの Canvas は技術パートの間ずっと置いておき、こだわりの手順でだけ見せる */}
      <KodawariStage
        shown={focus !== undefined}
        focus={focus?.index ?? null}
        count={focus?.count ?? 0}
      />
      {focus === undefined && <Slide id={id} elapsed={elapsed} />}
    </>
  );
}

function Slide({id, elapsed}: {id: string; elapsed: number}) {
  // 構成図の手順はどれも同じ図のまま(マウントし直さずに)光らせる経路だけを変える
  const route = archRouteOf(id);
  if (route !== null) {
    return <ArchDiagram focus={route} />;
  }
  switch (id) {
    case "close":
      return <Title elapsed={elapsed} />;
    case "closing":
      return <Closing />;
    default:
      return null;
  }
}

function Title({elapsed}: {elapsed: number}) {
  const shown = progress(elapsed, CLOSE_LID_DURATION_MS + 300, 900);
  return (
    <div className="present-layer present-tech-title" style={{opacity: shown}}>
      <h2>技術・実装の見どころ</h2>
    </div>
  );
}

function Closing() {
  return (
    <div className="present-layer present-closing">
      <img src={logoUrl} alt="IUBEO" />
    </div>
  );
}
