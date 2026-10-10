import {DUMMY_ITEM_KIND} from "../authority/local/rules";
import {authorityRegistry, type AuthorityDev} from "../authority/registry";
import {
  type CreatedStatus,
  FILE_KIND,
  type Item,
  isCreatedStatus,
  parseFileData,
} from "../items";
import {
  DIRECTORY_KIND,
  type StockFile,
  parseDirectoryData,
} from "../objects/directory/data";
import {kindOfId} from "../objects/layout";
import type {
  GameObject,
  ObjectAvailability,
  ObjectScope,
} from "../objects/types";
import {TEST_SPARE_IDS} from "../scenes/TestScene/layout";

/**
 * 開発用の操作(デバッグパネル・ダミーの箱を増やす・他のプレイヤーの振る舞い・手持ちを作る)。
 * ローカルのオーソリティの窓口が持つ dev(低レベルの入口)を借りて行う。dev が無ければ(サーバーの窓口、または窓口が無い)null。
 * 本番のコードはここを読まない
 */
export type LocalDevOps = ReturnType<typeof createLocalDevOps>;

type DevState = {
  borrowed: Array<{directoryId: string; file: StockFile}>;
  nextItem: number;
};
const states = new WeakMap<AuthorityDev, DevState>();

const createLocalDevOps = (playerId: string, dev: AuthorityDev) => {
  let state = states.get(dev);
  if (!state) {
    state = {borrowed: [], nextItem: 1};
    states.set(dev, state);
  }
  const s = state;

  const setDirectory = (object: GameObject, stock: readonly StockFile[]) => {
    const data = parseDirectoryData(object.data);
    dev.deliver({
      type: "object.upsert",
      object: {...object, data: {...data, stock: [...stock]}},
    });
  };

  const holdItem = (item: Item): void => dev.setHeldItem(item);

  return {
    spawnSpareObject: (scope: ObjectScope): string | undefined => {
      const taken = new Set(dev.getObjects().map((o) => o.id));
      const id = TEST_SPARE_IDS.find((x) => !taken.has(x));
      if (id === undefined) {
        return undefined;
      }
      dev.deliver({
        type: "object.upsert",
        object: {
          id,
          kind: kindOfId(id),
          scope,
          ...(scope === "personal" && {owner: playerId}),
          users: [],
          availability: "available",
          data: null,
        },
      });
      return id;
    },
    setAvailability: (id: string, availability: ObjectAvailability): void => {
      const object = dev.getObject(id);
      if (object) {
        dev.deliver({type: "object.upsert", object: {...object, availability}});
      }
    },
    removeObject: (id: string): void => {
      dev.deliver({type: "object.remove", id});
    },
    spawnItem: (kind: string = DUMMY_ITEM_KIND): string => {
      const id = `${kind}-${s.nextItem++}`;
      holdItem({id, kind, data: null});
      return id;
    },
    spawnNewFile: (status: CreatedStatus = "file_created"): string => {
      const id = crypto.randomUUID();
      holdItem({id, kind: FILE_KIND, data: {status}});
      return id;
    },
    editHeldFile: (): boolean => {
      const held = dev.getHeldItem();
      const file =
        held && held.kind === FILE_KIND ? parseFileData(held.data) : null;
      if (!held || !file || isCreatedStatus(file.status)) {
        return false;
      }
      holdItem({...held, data: {...file, status: "edited"}});
      return true;
    },
    deleteHeldItem: (): void => {
      if (dev.getHeldItem()) {
        dev.setHeldItem(null);
      }
    },
    borrowAsOther: (
      directoryId: string,
      random: () => number = Math.random,
    ): string | null => {
      const object = dev.getObject(directoryId);
      if (!object || object.kind !== DIRECTORY_KIND) {
        return null;
      }
      const {stock} = parseDirectoryData(object.data);
      const file = stock[Math.floor(random() * stock.length)];
      if (!file) {
        return null;
      }
      s.borrowed.push({directoryId, file});
      setDirectory(
        object,
        stock.filter((f) => f.id !== file.id),
      );
      return file.id;
    },
    returnAsOther: (directoryId: string): string | null => {
      const index = s.borrowed.findIndex((b) => b.directoryId === directoryId);
      const object = dev.getObject(directoryId);
      const entry = s.borrowed[index];
      if (!entry || !object) {
        return null;
      }
      s.borrowed.splice(index, 1);
      const {stock} = parseDirectoryData(object.data);
      setDirectory(object, [...stock, entry.file]);
      return entry.file.id;
    },
    getBorrowedCount: (): number => s.borrowed.length,
    getAchieved: (): number => dev.getAchieved(),
  };
};

/**
 * 今の窓口の開発用の操作。ローカルのオーソリティが無い、または dev を持たない窓口なら null
 * (押せない操作は、呼び出し側が null で無効にする)
 */
export const getLocalDevOps = (): LocalDevOps | null => {
  const authority = authorityRegistry.current();
  return authority?.dev
    ? createLocalDevOps(authority.playerId, authority.dev)
    : null;
};
