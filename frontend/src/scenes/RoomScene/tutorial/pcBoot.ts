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
  /** 電源を扱う PC(部屋の PC) */
  pcId: string | undefined;
  bootMs: number;
  /** チュートリアルを終えたことが保存されているか */
  completed: () => boolean;
  /** 起動し終えた(電源が on になった) */
  onBooted: () => void;
};

/**
 * 部屋のチュートリアルと PC の電源をつなぐ。
 *
 * - 終えるまでは電源を落としておき、終えたら点ける(sync にチュートリアルの状態を渡す)
 * - 落ちている PC を触ったら(セッションが active になったら)起動を始め、点いたら onBooted で知らせる
 * - dispose(部屋を出る)で点けて戻す。試合の PC が真っ暗にならないように
 */
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
