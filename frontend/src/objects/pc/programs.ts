import type {PcProgramName} from "../layout";
import {desktopProgram} from "./desktop/DesktopProgram";
import type {PcProgram} from "./program";
import {searchProgram} from "./search/SearchProgram";

const PROGRAMS: Record<PcProgramName, PcProgram> = {
  search: searchProgram,
  desktop: desktopProgram,
};

export const programOf = (name: string | undefined): PcProgram =>
  PROGRAMS[name as PcProgramName] ?? searchProgram;
