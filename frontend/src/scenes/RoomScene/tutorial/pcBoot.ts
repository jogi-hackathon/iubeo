import type {PcPowerStore} from "../../../objects/pc/power";
import type {PcSessionState} from "../../../objects/pc/session";

type SessionPort = {
  getState(): PcSessionState;
  subscribe(listener: () => void): () => void;
};

type Options = {
  power: Pick<
    PcPowerStore,
    "get" | "subscribe" | "boot" | "turnOn" | "turnOff"
  >;
  session: SessionPort;
  pcId: string | undefined;
  bootMs: number;
  completed: () => boolean;
  onBooted: () => void;
};

export const linkPcBoot = ({
  power,
  session,
  pcId,
  bootMs,
  completed,
  onBooted,
}: Options) => {
  const offSession = session.subscribe(() => {
    const {phase, objectId} = session.getState();
    if (phase === "active" && objectId === pcId) {
      power.boot(bootMs);
    }
  });
  const offPower = power.subscribe(() => {
    if (power.get() === "on") {
      onBooted();
    }
  });
  return {
    sync: (status: "idle" | "running" | "completed"): void => {
      if (status === "completed") {
        power.turnOn();
      } else if (!completed()) {
        power.turnOff();
      }
    },
    dispose: (): void => {
      offSession();
      offPower();
      power.turnOn();
    },
  };
};
