export type ClientTarget = {
  interact: () => void;
};

const targets = new Map<string, ClientTarget>();

export const registerClientTarget = (
  id: string,
  target: ClientTarget,
): (() => void) => {
  targets.set(id, target);
  return () => {
    if (targets.get(id) === target) {
      targets.delete(id);
    }
  };
};

export const getClientTarget = (id: string): ClientTarget | undefined =>
  targets.get(id);

export const hasClientTarget = (id: string): boolean => targets.has(id);
