export const COUNTDOWN_RED_FROM_MS = 20_000;
export const COUNTDOWN_NOISE_FROM_MS = 10_000;
const RELEASE_MS = 1000;

export type CountdownLevels = {red: number; noise: number};

const rampUntilDeadline = (remainingMs: number, fromMs: number): number =>
  Math.min(Math.max(1 - remainingMs / fromMs, 0), 1);

export const countdownTarget = (remainingMs: number | null): CountdownLevels =>
  remainingMs === null
    ? {red: 0, noise: 0}
    : {
        red: rampUntilDeadline(remainingMs, COUNTDOWN_RED_FROM_MS),
        noise: rampUntilDeadline(remainingMs, COUNTDOWN_NOISE_FROM_MS),
      };

export const approachCountdown = (
  current: CountdownLevels,
  target: CountdownLevels,
  dtMs: number,
): CountdownLevels => {
  const release = (from: number, to: number) =>
    to >= from ? to : Math.max(to, from - dtMs / RELEASE_MS);
  return {
    red: release(current.red, target.red),
    noise: release(current.noise, target.noise),
  };
};
