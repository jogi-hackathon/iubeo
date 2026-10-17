const FRAME_MS = 1000 / 60;
const TOLERANCE_MS = 2;

export const createFrameGate = () => {
  let next = -Infinity;
  return (now: number): boolean => {
    if (now < next - TOLERANCE_MS) {
      return false;
    }
    next = now - next > FRAME_MS * 2 ? now + FRAME_MS : next + FRAME_MS;
    return true;
  };
};
