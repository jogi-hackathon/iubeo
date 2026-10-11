import {uniform} from "three/tsl";

export const GLITCH_PEAK = 0.25;

export const glitchEnvelope = (t: number): number => {
  if (t <= 0 || t >= 1) {
    return 0;
  }
  if (t < GLITCH_PEAK) {
    const rise = t / GLITCH_PEAK;
    return rise * rise;
  }
  const fall = 1 - (t - GLITCH_PEAK) / (1 - GLITCH_PEAK);
  return fall * fall;
};

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export type GlitchPulseOptions = {
  now?: () => number;
  reducedMotion?: () => boolean;
};

export const createGlitchPulse = ({
  now = () => performance.now(),
  reducedMotion = prefersReducedMotion,
}: GlitchPulseOptions = {}) => {
  let startedAt = 0;
  let duration = 0;

  return {
    pulse: (ms: number): void => {
      if (reducedMotion() || ms <= 0) {
        return;
      }
      startedAt = now();
      duration = ms;
    },
    strength: (): number =>
      duration === 0 ? 0 : glitchEnvelope((now() - startedAt) / duration),
  };
};

export const cameraGlitch = createGlitchPulse();

export const glitchStrength = uniform(0);

export const updateGlitch = (): void => {
  glitchStrength.value = cameraGlitch.strength();
};
