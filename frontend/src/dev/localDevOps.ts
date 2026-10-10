import {DUMMY_ITEM_KIND} from "../authority/local/rules";
import {authorityRegistry, type AuthorityDev} from "../authority/registry";
import {
  type CreatedStatus,
  FILE_KIND,
  type Item,
  isCreatedStatus,
  parseFileData,
} from "../items";
import type {Team} from "../net/types";
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

/** 窓口ごとの開発用の状態(他のプレイヤーに借りられたファイル・アイテムの採番)。窓口が外れると一緒に捨てられる */
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

  /** 手持ちを置き換える(持っていたアイテムは消える) */
  const holdItem = (item: Item): void => dev.setHeldItem(item);

  return {
    /** 予備のダミーを、空いている一番若い id(TEST_SPARE_IDS)で置き、その id を返す。全部使われていれば undefined(デバッグパネルの「追加」が使う。置き場所はシーンのレイアウトが決める) */
    spawnSpareObject: (scope: ObjectScope): string | undefined => {
      const taken = new Set(dev.getObjects().map((o) => o.id));
      const id = TEST_SPARE_IDS.find((x) => !taken.has(x));
      if (id === undefined) {
        return undefined;
      }
      // ダミーの箱の置き方(id の種類は接頭辞で決まる。personal は自分の物)
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
    /** 置いてあるダミーの箱の出し入れを、使用可・不可で切り替える */
    setAvailability: (id: string, availability: ObjectAvailability): void => {
      const object = dev.getObject(id);
      if (object) {
        dev.deliver({type: "object.upsert", object: {...object, availability}});
      }
    },
    /** オブジェクトを片付ける(その id の物を消す) */
    removeObject: (id: string): void => {
      dev.deliver({type: "object.remove", id});
    },
    /** ダミーのアイテムを手に持たせる。持っていたアイテムは置き換わって消える */
    spawnItem: (kind: string = DUMMY_ITEM_KIND): string => {
      const id = `${kind}-${s.nextItem++}`;
      holdItem({id, kind, data: null});
      return id;
    },
    /** 新しく作ったファイル(ワークスペースで作る物の代わり)を手に持たせる。取り出し元ではなく、色も無い */
    spawnNewFile: (status: CreatedStatus = "file_created"): string => {
      const id = crypto.randomUUID();
      holdItem({id, kind: FILE_KIND, data: {status}});
      return id;
    },
    /** 手持ちのファイルを編集済みにする(同じ id で status を "edited" に更新する。ワークスペースの編集の代わり)。作成したファイルは編集できず、編集できたら true */
    editHeldFile: (): boolean => {
      const held = dev.getHeldItem();
      const file =
        held && held.kind === FILE_KIND ? parseFileData(held.data) : null;
      // 作成したファイルは編集しない
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
    /** 他のプレイヤーとして、ディレクトリの在庫からランダムに 1 つ借りる。借りた id を返す(在庫が空なら null) */
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
    /** 他のプレイヤーが借りているファイルを、そのディレクトリに 1 つ返す(借りた順)。返した id を返す */
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
    /** 他のプレイヤーが借りているファイルの数 */
    getBorrowedCount: (): number => s.borrowed.length,
    /** 達成の数(編集した在庫のファイルが、ディレクトリに入ったファイルの数。同じファイルは 1 回) */
    getAchieved: (): number => dev.getAchieved(),
    /** 勝利フラグを 1 つ切り替える。bypassPermission は、ライターの置き場の使える・使えないも連動する */
    toggleTeamFlag: (flag: keyof Team): void =>
      dev.setTeam({[flag]: !dev.getTeam()[flag]}),
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
