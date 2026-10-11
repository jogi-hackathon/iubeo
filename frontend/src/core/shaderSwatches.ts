import {Group, type Object3D} from "three";

/**
 * シェーダーの見本帳。操作して初めてマウントされる物(手に持ったアイテム・炎・俯瞰の板など)は、
 * シーンを描くウォームアップ(ShaderWarmup)では通らないので、同じマテリアル×ジオメトリの見本をここに登録しておき、
 * ウォームアップの間だけシーンに足して描く。
 * シーンに置かれているが非表示なだけの物(チュートリアルで現れる机や PC など)は、ウォームアップが表示を一時的に切り替えて描くので登録しない。
 *
 * 見本は捨てない(dispose しない)。three はマテリアルやジオメトリの dispose でパイプラインの参照数を減らし、
 * 0 になったら捨てるので、見本が持ち続けることで、実物がアンマウントされても次に現れるときの再コンパイルを避ける
 */
export type SwatchFactory = () => Object3D;

/** 見本を置く位置。カメラから十分遠くに置き、ウォームアップの覆いが無くても映らないようにする */
export const SWATCH_BOOK_Y = -1000;

const factories = new Map<string, SwatchFactory>();
let book: Group | null = null;

const prepare = (name: string, object: Object3D): Object3D => {
  object.name = `shader-swatch:${name}`;
  object.traverse((o) => {
    // 視錐台カリングを切って必ず描かせる。見本に当たり判定は要らない
    o.frustumCulled = false;
    o.raycast = () => {};
  });
  return object;
};

const replaceIn = (group: Group, name: string, create: SwatchFactory): void => {
  const old = group.getObjectByName(`shader-swatch:${name}`);
  if (old) {
    group.remove(old);
  }
  group.add(prepare(name, create()));
};

/**
 * 見本を登録する(マテリアルを定義するモジュールの直下で呼ぶ)。
 * 同じ名前で登録し直すと置き換える(Fast Refresh でモジュールが再評価されたとき用)。
 * 見本はウォームアップが初めて要るときに作る(getShaderSwatchBook)
 */
export const registerShaderSwatch = (
  name: string,
  create: SwatchFactory,
): void => {
  factories.set(name, create);
  if (book) {
    replaceIn(book, name, create);
  }
};

/** 登録済みの見本をまとめた group(1 つを使い回す)。ウォームアップがシーンに足し、終わったら外す */
export const getShaderSwatchBook = (): Group => {
  if (!book) {
    book = new Group();
    book.name = "shader-swatch-book";
    book.position.y = SWATCH_BOOK_Y;
    for (const [name, create] of factories) {
      replaceIn(book, name, create);
    }
  }
  return book;
};

/** 登録されている見本の名前(デバッグ表示・テスト用) */
export const shaderSwatchNames = (): string[] => Array.from(factories.keys());
